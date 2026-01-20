# Product Definition: Mariner's AI Grid (MAG)

## Initial Concept
**"The Waze of the Ocean. Local-First AI Weather & Social Hazards."**
Mariner’s AI Grid is an open-source, agentic weather platform built for the **blue-water** community. It rejects the "Cloud-First" orthodoxy, ensuring that critical weather intelligence is sovereign, private, and available offline. By running Google’s GraphCast AI directly on the device's NPU, MAG delivers 10-day global forecasts that are faster, more accurate, and 95% more data-efficient than traditional GRIB downloads.

## Target Audience
- **Primary:** Blue-water sailors and offshore cruisers who operate in environments with limited or expensive connectivity.
- **Context:** These users require reliable, high-resolution weather data to navigate safely across oceans, often relying on satellite connections (Iridium, Starlink) where bandwidth is a premium.

## Core Value Proposition
1.  **Tactical Accuracy:** Delivers higher-resolution, AI-driven local forecasts that outperform generic global models. It achieves this by incorporating real-time on-board sensor data to fine-tune the local inference.
2.  **Offline Sovereignty:** Ensures that critical weather data and AI inference capabilities remain fully functional even when satellite connections fail. The system is built to survive offline, with data stored locally and inference running on the device's hardware.
3.  **Extreme Data Efficiency:** Drastically reduces satellite bandwidth costs (by ~95%) compared to traditional GRIB downloads through the "Cloud Slicer" architecture and precision-quantized Parquet seeds.

## Key Features (MVP)
### 1. On-Device AI Inference
-   **Mechanism:** Runs GraphCast AI models directly on the mobile device's NPU.
-   **Optimization:** In line with the Maverick ethos, we optimize compute specifically for each platform (iPad Pro, iPhone 17 Pro Max) to maximize efficiency and battery life.
-   **Architecture:** Utilizing a split-vector database design that allows for heavy AI compute on one side while maintaining a fluid, 120Hz glass UX on the other, ensuring zero-latency interaction.

### 2. Offline Map Visualization ("The Chart Table")
-   **Technology:** Uses Mapbox GL Native to render detailed weather layers on tactical charts.
-   **Experience:** Seamless visualization of wind, pressure, and wave patterns without an internet connection.

### 3. The "Cloud Slicer" & Seed Delivery
-   **Backend:** A Python-based service processing ECMWF AIFS datasets.
-   **Function:** Delivers highly compressed ~2MB "Seeds" tailored to the user's route, accessible via low-bandwidth satellite links.

### 4. The "Circular Truth" Loop & Social Layer
-   **Signal K Integration (The Bridge):** Pulls real-time NMEA 2000 data to ground-truth the local AI model.
-   **Crowdsourced Hazards (The Waze Layer):** Vital for **island hopping and harboring** (anchorage data, surge) and **blue-water transit** (tracking floating debris/containers).
-   **Autonomous Agentic Alerts:** Proactive AI agents monitoring weather and social reports for emerging risks.

## User Experience & Design
-   **Planning & Analysis Mode (Data-Dense):** Scientific view for weather routing and storm tracking (waves/wind).
-   **Night Watch Mode (Tactical):** High-contrast, dark-themed mode to preserve night vision.
-   **Primary Hardware:** iPad Pro ("The Chart Table") and iPhone 17 Pro Max.