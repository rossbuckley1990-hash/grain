# Release notes

The worker now analyzes queue depth, because the previous version could not keep up.

The build fails for three reasons. The cache never expires. The manifest goes
stale. Nothing bounds the retry loop.

That retry loop is the real problem. Its backoff is exponential, and someone set
the timeout to an arbitrary value. We chose that timeout without measuring
anything. Caching stops us dropping requests, but the failure still propagates.

The resolver walks the chain once and returns a path.

```js
// This block is code, not prose. grain skips it entirely.
const decision = makeDecision();
utilize(inflatedWords);
```

See [the design doc](https://example.com/design) for details.

The worker polls the queue every second, claims one job, runs it to completion,
and reports the result. Then it starts over.
