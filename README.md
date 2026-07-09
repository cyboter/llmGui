# LLM GUI

Windows-Desktop-App als benutzerfreundlicher Wrapper für [llama.cpp](https://github.com/ggml-org/llama.cpp). Richtet sich an zwei Zielgruppen gleichzeitig: Einsteiger, die ein lokales KI-Sprachmodell ohne Fachwissen nutzen wollen (Einfacher Modus), und Profis, die Zugriff auf alle Inferenzparameter, eigene GGUF-Modelle und Server-Konfiguration brauchen (Erweiterter Modus).

## Architektur

- **Shell:** [Tauri 2.x](https://v2.tauri.app/) — Rust-Backend + React/TypeScript-Frontend (Vite)
- **Inferenz:** kein gebündeltes llama.cpp-Binary. Die App lädt beim Ersteinrichtungs-Flow die zur erkannten Hardware passende `llama-server`-Release-Variante (CPU/CUDA/Vulkan) direkt von GitHub-Releases von `ggml-org/llama.cpp` (oder einem im Erweiterten Modus konfigurierbaren Fork) herunter und verwaltet den Prozess als Kindprozess.
- **Kommunikation:** HTTP gegen die OpenAI-kompatible API von `llama-server` (`/v1/chat/completions`, SSE-Streaming).

Projektstruktur:

```
src-tauri/          Rust-Backend
  src/hardware/      RAM/GPU-Erkennung (GlobalMemoryStatusEx, DXGI)
  src/engine/        Release-Auflösung, Download, Prozess-Lifecycle, Retry-Kaskade
  src/models/        Kuratierte Modell-Registry
  src/config/        ServerConfig (Inferenzparameter)
  src/errors/        Technische Fehler → laienverständliche Meldungen
  src/commands.rs    Tauri-Commands (Frontend-Schnittstelle)
src/                 React-Frontend
  components/onboarding/   Ersteinrichtungs-Flow
  components/chat/         Chat-Interface mit Streaming
  components/advanced/     Erweiterter Modus (Parameter/Modelle/Logs)
model-registry.json  Kuratierte Modellliste (Remote-updatable Manifest)
```

## Entwicklung

Voraussetzungen: Rust (stable, via [rustup](https://rustup.rs)), Node.js 20+.

```powershell
npm install
npm run tauri -- dev
```

Release-Build (Installer):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\llmgui.key"
npx tauri build
```

Erzeugt MSI und NSIS-Setup unter `src-tauri/target/release/bundle/`. Der Updater-Signing-Key liegt lokal unter `%USERPROFILE%\.tauri\` und ist nicht Teil des Repos.

## Bekannte Einschränkungen

- **Modell-Registry-Lizenzen:** Die kuratierten Modelle unterliegen den jeweiligen Herstellerlizenzen (Llama Community License, Apache 2.0 für Qwen). Details siehe `model-registry.json` und die Lizenzhinweise im Onboarding.
- **Eigene Fork-Repos:** Die automatische Asset-Erkennung erwartet das Namensschema `llama-<tag>-bin-win-<backend>-<arch>.zip` der offiziellen llama.cpp-Releases. Forks mit abweichendem Schema werden nicht automatisch erkannt.
- **Keine echte Ladefortschrittsanzeige** beim Modell-Laden in `llama-server` (nur `/health` als bereit/nicht bereit) — das Onboarding zeigt daher einen unbestimmten Ladeindikator statt einer Prozentanzeige.

## Hardware-Testmatrix

Da lokal keine vollständige GPU-Hardware-Vielfalt verfügbar ist, sollte vor jedem Release manuell auf folgender Matrix getestet werden:

| Konfiguration | Zu prüfen | Zuletzt getestet |
|---|---|---|
| Reines CPU-System (kein GPU-Treiber) | Backend-Fallback auf CPU, Onboarding-Empfehlung, Chat-Antwortzeit | — |
| Ältere NVIDIA-GPU (wenig VRAM, z.B. GTX 10xx) | Retry-Kaskade bei OOM (`start_with_retry` reduziert GPU-Layer schrittweise) | — |
| Aktuelle NVIDIA-GPU (RTX 30xx/40xx) | CUDA-Backend-Download inkl. Redistributable, volle GPU-Auslastung | ✅ RTX 3080, siehe unten |
| AMD-GPU | Vulkan-Backend (vendor-neutral), optional HIP/ROCm-Override im Erweiterten Modus | — |

**Verifiziert (2026-07-09, RTX 3080 + 64 GB RAM):** Hardware-Erkennung, Modellempfehlung, Engine-Download (CUDA), Modell-Download mit Checksum-Verifikation, Server-Start, Chat-Streaming, alle drei Tabs des Erweiterten Modus, Anwenden-Flow (Server-Neustart mit neuer Konfiguration) — jeweils end-to-end mit echtem laufendem `llama-server` getestet.

Automatisierte CI (`windows-latest`) deckt nur den reinen CPU-Kompilierpfad ab (kein GPU in Standard-Runnern) — GPU-Pfade erfordern manuelle Tests vor Releases.

## Lizenz

Projektlizenz siehe LICENSE (falls vorhanden). Die von der App heruntergeladenen KI-Modelle und die llama.cpp-Engine unterliegen ihren jeweils eigenen Lizenzen, unabhängig von der Lizenz dieses Projekts.
