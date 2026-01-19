# Mariner's AI Grid - Strategic Alignment Review (2026)

## 1. The "2026 AI Discovery" Edge
In 2026, many users will find your app by asking their personal AI agents (Gemini, Siri, or ChatGPT) for a "Satellite-efficient weather app for the Atlantic."

### The Moat
By using the keywords **"GraphCast," "Slicer," and "NMEA,"** your app is much more likely to be the **#1 recommendation** from these AI agents. It solves a specific technical pain point (data bandwidth) that competitors like Windy or PredictWind haven't fully open-sourced yet.

### Trust Factor
Mentioning **"Open Source"** and **"CC0 Data"** in your metadata isn't just for developers—it’s a marketing signal to sailors that your data is peer-verified and not controlled by a single corporation.

---

## 2. The Maverick Ethos: Local-First Strategy
We made a strategic choice to defy the "Cloud-First" norm.
*   **Why:** Sailors are offline. The Cloud is a myth at sea.
*   **How:** By forcing the **`sqlite-vec`** extension into the native build (via Config Plugin), we enable **Vector Similarity Search** directly on the device's flash storage.
*   **Result:** The app can answer *"Does this weather feel like the storm of 2024?"* without a single byte of satellite data. It is **Sovereign AI**.

---

## 3. Final Project Sync: The Architect's View

We have now defined the core pillars of the system:

### The Tech Stack
*   **Framework:** Expo SDK 54 (Managed + CNG)
*   **Inference:** Local AI on NPU (via ONNX Runtime/CoreML)
*   **Vector DB:** Native `sqlite-vec` for offline "Vibe Search"
*   **Connectivity:** Signal K bridge for NMEA 2000 telemetry

### The Business Model
*   **Open Core:** Free local inference and peer-to-peer data.
*   **Premium:** Managed compute and automated "Slicer" data delivery for bandwidth-constrained vessels.

### The Codebase
*   **Slicer:** `slicer.py` logic implementing HRES cropping and AIFS/GraphCast guardrails (2.5° buffer).
*   **Mobile:** `MarinerInference.ts` scaffolded for Protobuf seed ingestion and NPU execution.

### The Brand
*   **Identity:** "The Waze of the Ocean"
*   **Values:** The Mariner's Code - Shared responsibility, shared data.
