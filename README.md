# 🎈 3D Low-Poly Balloon Showcase & Survival Game

An interactive 3D WebGL web application powered by **Three.js** and **Vite**, featuring real-time 3D hot air balloon deflation physics and a 3D survival game.

---

## 🌟 Features

### 1. 🎈 3D Balloon Air Pressure Simulator (`index.html`)
- **Realistic 14-Keyframe Deflation Physics**: Accurate 3D vertex-level deformation matching real hot air balloon deflation (doughnut crown dimpling, vertical gore pleats, rigid basket touchdown, sideways collapse, and ground cloth draping).
- **Interactive Controls**: Air gauge indicator, Deflate button, Inflate button, and Auto-Cycle breathing mode.

### 2. 🎮 Balloon Air Escape - 3D Survival Game (`game.html`)
- **Survival Gameplay Loop**: Steer the 3D balloon through a high-altitude sky while air pressure continuously drains over time!
- **Collectibles & Hazards**: Collect floating **Air Pumps (⛽)** to inflate +25% air pressure and avoid **Spike Mines (⚠️)**.
- **Dynamic Environment**: High-altitude dreamy sky gradient, floating 3D low-poly cloud clusters, wind streak particles, and distant rolling countryside hills.

---

## 🚀 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 📦 Vercel Deployment Instructions

### Option 1: Deploy via Vercel CLI
```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy to Vercel
vercel
```

### Option 2: Deploy via GitHub (Recommended)
1. Initialize Git and commit code:
   ```bash
   git init
   git add .
   git commit -m "Deploy 3D Balloon app and game"
   ```
2. Push repository to **GitHub**.
3. Go to [Vercel Dashboard](https://vercel.com/new).
4. Click **Import Project** and select your GitHub repository.
5. Vercel will automatically detect **Vite** and deploy!
