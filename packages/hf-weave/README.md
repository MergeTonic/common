# @mergetonic/hf-weave

TypeScript helpers for Tonic weave + Hugging Face Hub (blob push, repo file I/O, weave index, CTRD).

- Peer: `@mergetonic/core` (weave Git types live in core).
- Python Hub I/O: `mergetonic-hf-weave` (`hf weave` console script), including **`hf weave sync`**.
- TS parity exports: CTRD helpers (`buildCtRdDocument`, `ctrdIdFromPayload`, `fetchCtRdFromHub`, `publishCtRdToHub`), `hubPushLocalWeaveBlobs`, `hubPrefetchBlobKeys`, `refreshWeaveHubIndex`, `hubWeaveOffline`. Used by **`merge-tonic weave sync`** / **`weave replay`** when `@mergetonic/hf-weave` is linked from core.

See [docs/tonic-hf-weave.md](../../docs/tonic-hf-weave.md) in the monorepo.
