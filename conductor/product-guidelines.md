# Product Guidelines: Mariner's AI Grid (MAG)

## Voice and Tone
**The Sovereign Navigator**
*   **Professional & Mission-Critical:** Our communication is direct, reliable, and authoritative. We avoid marketing fluff. When a sailor is checking the forecast for a storm, they need clarity, not personality.
*   **Technical Authority:** We use precise nautical and meteorological terminology. We respect the user's expertise and provide the raw data they need to make command decisions.
*   **No-Nonsense:** Alerts and status messages are concise and actionable.

## Visual Identity & UX
**Ultra-Modern "Glass" Aesthetic (iOS 18+ Inspired)**
*   **Speed & Beauty First:** The interface leverages modern native capabilities (translucency, blur, fluid animations) to create a deeply immersive experience. It should feel like a piece of high-end, futuristic instrumentation.
*   **Environmental Moods:** The UI adapts dynamically to the vessel's operational state:
    *   **Planning Mode:** High-fidelity, translucent layers over charts for detailed analysis.
    *   **Night Watch Mode:** A specialized, high-contrast red/black theme that completely eliminates blue light to preserve natural night vision.
    *   **Emergency Mode:** A stripped-down, high-visibility interface that highlights critical survival data (position, drift, nearest safe haven) and suppresses non-essential noise.

## Operational Principles
**1. Offline-First & Sovereign**
*   **The Golden Rule:** "If it breaks when the satellite fails, it's a bug."
*   **No Cloud Dependency:** Every core feature—inference, rendering, routing—MUST function 100% offline. The cloud is treated as an optional optimization (for fresh seeds), not a requirement.

**2. Open Source & The Mariner's Ethos**
*   **Communal Safety:** We adhere to the law of the sea: we help any boat in danger. Telemetry data is a shared resource for the safety of the fleet.
*   **Anonymous Telemetry:** By default, there are **no user accounts**. Each device generates an anonymous, unique ID.
*   **Local Learning:** Real-time boat telemetry (wind, pressure, motion) is fed directly into the local model every six minutes to improve prediction accuracy for the immediate vicinity.
*   **Future-Proofing:** While the core is anonymous, the architecture allows for optional user accounts in the future (specifically for the "Waze Layer" social features), at which point strict local-only privacy rules will apply to personal data.

## Data Privacy & Sovereignty
*   **Telemetry is Public Utility:** Technical boat data (weather observations) is treated as open-source contributions to the grid's accuracy.
*   **Identity is Sovereign:** Because there is no central login, the user's "identity" is their device.
*   **No "Phone Home":** The app does not track user behavior or send analytics unless it is critical for the "Circular Truth" weather model loop.
