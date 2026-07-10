# LLM GUI

A friendly Windows desktop wrapper around [llama.cpp](https://github.com/ggml-org/llama.cpp) for running local AI language models — no command line, no manual setup.

LLM GUI is built for two audiences at the same time:

- **Everyday users** who just want a local chatbot running in a few clicks, without ever encountering terms like "quantization," "context length," "GGUF," or a terminal.
- **Power users** who want full control over inference parameters, custom GGUF models, KV-cache quantization, and server configuration.

The guiding principle is **progressive disclosure**: Simple Mode is the default and is fully usable on its own; an "Advanced" panel (gear icon) surfaces every power-user option without ever complicating the simple path.

## Features

### Simple Mode
- **Guided first-run setup** — detects your RAM, GPU vendor, and VRAM, then recommends a model and quantization level automatically.
- **Three curated models** — "Small & fast," "Balanced," and "Large & powerful," each described in plain language instead of jargon, with the hardware-appropriate one pre-selected (any of the three can still be picked).
- **One-click download** — model and inference engine are fetched with progress bars, resumable downloads, disk-space checks, and SHA-256 checksum verification.
- **Streaming chat** — token-by-token responses, multiple chat sessions, "New chat," persisted locally.
- **Automatic recovery** — if the model fails to start (e.g. not enough VRAM), the app automatically retries with reduced GPU offload down to a CPU-only fallback, and translates technical failures into plain-language messages.

### Advanced Mode
- Fine-grained inference controls: temperature, top-p, top-k, repeat penalty, context length, CPU threads, GPU layers.
- **KV-cache quantization** — independent key/value cache quantization (`f16` / `q8_0` / `q4_0`) to trade memory footprint for precision.
- Load your own GGUF files via a native file picker; manage a list of custom + curated models.
- Editable system prompt and configurable server port.
- Point the engine downloader at a different `llama.cpp` fork/repo.
- Live server log viewer with one-click copy, useful for troubleshooting.
- "Apply & restart" hot-swaps the running server with the new configuration, with automatic rollback to the last known-good config if the new one fails to start.

### Cross-cutting
- **Bilingual UI (German/English)** — auto-detected from the OS locale on first launch, switchable anytime from Advanced Mode. Backend errors carry stable error codes so translations stay consistent across languages.
- **Auto-update** — checks for new app releases in the background and installs them with one click ([`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/)).
- **No bundled engine binary** — the installer stays small; the correct `llama-server` build (CPU / CUDA / Vulkan) is fetched from GitHub Releases on first run, matched to detected hardware.

## Architecture

- **Shell:** [Tauri 2.x](https://v2.tauri.app/) — Rust backend + React/TypeScript frontend (Vite).
- **Inference engine:** no bundled llama.cpp binary. On first run, the app downloads the `llama-server` release variant (CPU/CUDA/Vulkan) matching the detected hardware directly from `ggml-org/llama.cpp` GitHub Releases (or a fork configurable in Advanced Mode), and manages it as a child process — starting, health-checking, restarting, and shutting it down alongside the app.
- **Communication:** plain HTTP against `llama-server`'s OpenAI-compatible API (`/v1/chat/completions`, SSE streaming).
- **i18n:** [react-i18next](https://react.i18next.com/), with German and English resource bundles under `src/i18n/locales/`.

### Project layout

```
src-tauri/                 Rust backend
  src/hardware/             RAM/GPU detection (GlobalMemoryStatusEx, DXGI)
  src/engine/               Release resolution, download, process lifecycle, retry cascade
  src/models/               Curated model registry
  src/config/               ServerConfig (inference parameters, KV-cache quantization)
  src/errors/               Technical failures → stable error codes for i18n translation
  src/commands.rs           Tauri commands (the only frontend/backend boundary)
  capabilities/             Tauri v2 permission manifests
src/                        React frontend
  components/onboarding/    First-run setup flow
  components/chat/          Chat interface with SSE streaming
  components/advanced/      Advanced Mode (parameters / models / logs tabs)
  components/shared/        Language switcher, update banner, reusable form controls
  i18n/                     i18next setup + de/en translation resources
  state/                    localStorage-backed app/session state
model-registry.json         Curated model list (remotely updatable manifest: URLs, checksums, licenses)
```

## Getting started (development)

**Prerequisites:** Rust (stable, via [rustup](https://rustup.rs)), Node.js 20+, Windows (the app targets Windows only — WMI-free hardware detection uses Win32 APIs directly).

```powershell
npm install
npm run tauri -- dev
```

This launches the Tauri dev shell with hot-reload for the frontend and automatic Rust recompilation on backend changes.

### Building an installer

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\llmgui.key"
npx tauri build
```

Produces a signed MSI and NSIS installer under `src-tauri/target/release/bundle/`. The updater signing key lives locally at `%USERPROFILE%\.tauri\` and is intentionally **not** part of the repository — generate your own with:

```powershell
npx tauri signer generate -w "$env:USERPROFILE\.tauri\llmgui.key" --ci
```

and update the `pubkey` field in `src-tauri/tauri.conf.json` accordingly.

## How model download & inference work

1. On first run, the app detects total RAM and the best available GPU (vendor + VRAM) via native Win32 APIs — no WMI/COM, which avoids a class of thread-affinity bugs that surface when COM is initialized on a Tauri-managed Tokio worker thread.
2. Based on detected hardware, one of three curated models is recommended (but any can be picked): each is a `Q4_K_M`-quantized GGUF from [bartowski](https://huggingface.co/bartowski) on Hugging Face.
3. The engine binary matching the recommended backend (CUDA / Vulkan / CPU) is resolved against the latest `ggml-org/llama.cpp` GitHub release, matching the naming scheme `llama-<tag>-bin-win-<backend>-<arch>.zip`. For CUDA, the separate `cudart-llama-bin-win-cuda-*.zip` redistributable is fetched and merged automatically.
4. Both engine and model downloads are resumable (HTTP range requests), checksum-verified, and disk-space-checked before starting.
5. `llama-server.exe` is launched as a child process with CLI flags derived from `ServerConfig`; the app polls `/health` until ready. If startup fails (most commonly GPU out-of-memory), a retry cascade progressively reduces `--n-gpu-layers` down to a pure CPU fallback before surfacing an error.

## Known limitations

- **Model registry licenses** — curated models are subject to their respective upstream licenses (Llama Community License for the Llama-based models, Apache License 2.0 for Qwen2.5). See `model-registry.json` and the in-app license notices shown during onboarding.
- **Fork asset naming** — automatic engine asset detection expects the official llama.cpp naming scheme (`llama-<tag>-bin-win-<backend>-<arch>.zip`). Forks with a different scheme won't be picked up automatically.
- **No true load progress bar** — `llama-server`'s `/health` endpoint is binary (ready / not ready), so the onboarding flow shows an indeterminate spinner rather than a percentage while the model loads.
- **Windows only** — hardware detection and process management are Win32-specific by design; there's no macOS/Linux support.

## Hardware test matrix

Since a full range of GPU hardware isn't available in this development environment, the following matrix should be walked manually before each release:

| Configuration | What to verify | Last verified |
|---|---|---|
| CPU-only system (no GPU driver) | CPU backend fallback, onboarding recommendation, chat latency | — |
| Older NVIDIA GPU (low VRAM, e.g. GTX 10-series) | OOM retry cascade (`start_with_retry` progressively reduces GPU layers) | — |
| Modern NVIDIA GPU (RTX 30/40-series) | CUDA backend download incl. redistributable, full GPU utilization | ✅ RTX 3080 |
| AMD GPU | Vulkan backend (vendor-neutral), optional HIP/ROCm override in Advanced Mode | — |

**Verified end-to-end (RTX 3080 + 64 GB RAM):** hardware detection, model recommendation, engine download (CUDA), model download with checksum verification, server start, streaming chat, all three Advanced Mode tabs, apply-and-restart flow, KV-cache quantization (`q8_0` for both key and value), and language switching — each exercised against a real running `llama-server` instance via WebView2 remote debugging.

Automated CI (`windows-latest`) only covers the pure CPU compile path (no GPU on standard runners) — GPU code paths require manual testing before releases.

## Contributing

Issues and pull requests are welcome. If you're touching the download/process-management code in `src-tauri/src/engine/`, please describe what hardware you tested on — GPU-dependent code paths are hard to cover in CI.

## License

See `LICENSE` for the license of this project itself. Models and the llama.cpp engine downloaded by the app are governed by their own respective licenses, independent of this project's license.
