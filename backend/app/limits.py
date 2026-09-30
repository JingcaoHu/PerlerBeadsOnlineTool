"""Reject oversized multipart/JSON request bodies before they consume unbounded resources."""
from starlette.responses import JSONResponse

class PayloadTooLarge(Exception):
    pass

class BodyLimitMiddleware:
    def __init__(self, app, max_bytes=10 * 1024 * 1024 + 256 * 1024):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] not in {'POST', 'PUT', 'PATCH'}:
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        try:
            length = int(headers.get(b'content-length', b'0'))
        except ValueError:
            length = 0
        error = JSONResponse({'detail': '请求过大；图片不能超过 10 MB'}, status_code=413)
        if length > self.max_bytes:
            return await error(scope, receive, send)
        total = 0
        async def capped_receive():
            nonlocal total
            message = await receive()
            if message['type'] == 'http.request':
                total += len(message.get('body', b''))
                if total > self.max_bytes:
                    raise PayloadTooLarge()
            return message
        try:
            await self.app(scope, capped_receive, send)
        except PayloadTooLarge:
            await error(scope, receive, send)
