# Orayan AutoTrader 🚀

Bybit auto-execution layer for Orayan Hunter.
Signals detected → proxy signs & fires orders to Bybit.

---

## Repo Structure

```
orayan-autotrader/
├── backend/
│   ├── server.js          ← Express proxy (Bybit signing)
│   ├── package.json
│   ├── Dockerfile         ← Docker image for backend
│   └── .env.example
├── frontend/
│   └── index.html         ← Orayan Hunter UI
├── docker-compose.yml     ← Local testing only
└── README.md
```

---

## Bybit Testnet API Keys (do this first)

1. Go to https://testnet.bybit.com
2. Register / Login
3. Profile → **API Management** → **Create New Key**
4. Permissions needed:
   - ✅ Read
   - ✅ Trade (Unified Trading)
   - ✅ Positions
   - ✅ Orders
5. Save **Key** and **Secret** — you'll need them below

⚠️ Never commit API keys to GitHub. Always use environment variables.

---

## Local Testing (before deploying)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/orayan-autotrader.git
cd orayan-autotrader

# 2. Create your .env file
cp backend/.env.example backend/.env
# Fill in BYBIT_API_KEY and BYBIT_API_SECRET in the .env file

# 3. Start everything
docker-compose up --build

# Backend → http://localhost:3001/health
# Frontend → http://localhost:8080
```

---

## Northflank Deployment

### Step 1 — Create a new Northflank project
1. Go to https://northflank.com → **New Project**
2. Name it: `orayan-autotrader`

---

### Step 2 — Deploy Backend (Bybit Proxy)

1. Inside the project → **Add Service** → **Combined Service**
2. Name: `orayan-backend`
3. Connect your GitHub repo
4. **Root directory**: `backend`
5. **Build type**: `Dockerfile` ← important, select this
6. **Dockerfile path**: `Dockerfile`
7. **Port**: `3001`

#### Add Environment Variables:
| Key | Value |
|-----|-------|
| `BYBIT_API_KEY` | Your Bybit Testnet API key |
| `BYBIT_API_SECRET` | Your Bybit Testnet API secret |
| `BYBIT_TESTNET` | `true` |
| `PORT` | `3001` |

8. Deploy → wait for green ✅
9. Copy the **public URL** of this service (e.g. `https://orayan-backend-xxxx.northflank.app`)

---

### Step 3 — Deploy Frontend (Orayan Hunter)

1. Inside the project → **Add Service** → **Combined Service**
2. Name: `orayan-frontend`
3. Connect same GitHub repo
4. **Root directory**: `frontend`
5. **Build type**: `Dockerfile` ← select this
6. **Dockerfile path**: `Dockerfile`
7. **Port**: `80`
8. Deploy → wait for green ✅

---

### Step 4 — Configure Orayan Frontend

1. Open the Orayan Hunter URL in your browser
2. Go to **Settings** → **Auto-Trade Config**
3. Paste the backend URL from Step 2
4. Click **Test Connection** → should show ✅ TESTNET

---

## Switching to Live

1. In Northflank backend → **Environment Variables**:
   - Change `BYBIT_TESTNET` → `false`
   - Replace keys with your **Live** Bybit API keys
2. Redeploy backend
3. Frontend will automatically show **🔴 LIVE MODE** warning banner

---

## Oracle Deployment

```bash
# SSH into your Oracle instance
ssh ubuntu@YOUR_ORACLE_IP

# Clone the repo
git clone https://github.com/YOUR_USERNAME/orayan-autotrader.git
cd orayan-autotrader

# Create .env
cp backend/.env.example backend/.env
nano backend/.env   # fill in your keys, set BYBIT_TESTNET=false for live

# Run
docker-compose up -d --build

# Backend → http://YOUR_ORACLE_IP:3001/health
# Frontend → http://YOUR_ORACLE_IP:8080
```

Make sure Oracle security list allows **inbound TCP on ports 3001 and 8080**.
