import asyncio
from aiohttp import ClientSession
from aiortc import RTCPeerConnection, RTCSessionDescription

async def main():
    async with ClientSession() as s:
        await s.post('http://127.0.0.1:9200/camera', json={
            'pose': {'position': [-10, -0.38, 1.5], 'rotation': [1,0,0,0], 'fovYDegrees': 26.23, 'near': 0.01, 'far': 100},
            'width': 640,
            'height': 360,
        })
        pc = RTCPeerConnection()
        got = asyncio.Event()

        @pc.on('track')
        def on_track(track):
            print('track', track.kind, flush=True)
            async def recv_one():
                frame = await track.recv()
                print('frame', frame.width, frame.height, frame.time, flush=True)
                got.set()
            asyncio.create_task(recv_one())

        pc.addTransceiver('video', direction='recvonly')
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        async with s.post('http://127.0.0.1:9200/offer', json={'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}) as resp:
            print('offer status', resp.status, flush=True)
            answer = await resp.json()
        await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'], type=answer['type']))
        await asyncio.wait_for(got.wait(), timeout=20)
        await pc.close()

asyncio.run(main())
