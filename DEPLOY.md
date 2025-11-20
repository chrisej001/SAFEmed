# 🚀 Deploying SafeMed to Render

## Quick Deploy

1. **Push your code to GitHub** (already done ✓)

2. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Sign in with GitHub

3. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `chrisej001/SAFEmed`
   - Render will auto-detect Node.js

## Configuration Settings

### Basic Settings
```
Name: safemed (or your choice)
Environment: Node
Region: Choose closest to you
Branch: main
```

### Build & Deploy
```
Build Command: npm install
Start Command: npm start
```

### Environment Variables (Required)

Click "Add Environment Variable" and add these:

| Key | Value | Notes |
|-----|-------|-------|
| `MOCK_API` | `true` | Use `true` for testing, `false` for production |
| `PORT` | `10000` | Render automatically sets this, but you can override |
| `BASE_URL` | `https://hackathon-api.aheadafrica.org` | Your Dorra API URL |
| `API_TOKEN` | **(leave empty for mock mode)** | Add your real token when ready for production |
| `NODE_ENV` | `production` | Optional but recommended |

### Important Notes

**For Testing/Demo (No API Token Required):**
- Set `MOCK_API=true`
- Leave `API_TOKEN` empty
- App will work fully with in-memory data

**For Production (Real Dorra API):**
- Set `MOCK_API=false`
- Add your real `API_TOKEN` from AHEAD Africa
- Ensure `BASE_URL` is correct

## Auto-Deploy Setup

Render can automatically deploy when you push to GitHub:
1. In Render dashboard, go to your service settings
2. Under "Auto-Deploy", enable "Auto-deploy from branch: main"
3. Every `git push` will trigger a new deployment

## Health Check

After deployment, verify your app:
```
https://your-app-name.onrender.com/health
```

Should return:
```json
{
  "status": "ok",
  "mode": "mock",
  "timestamp": "2025-11-20T...",
  "apiConnected": true
}
```

## Render Free Tier Notes

- ✅ Free tier available
- ⏱️ Apps spin down after 15 minutes of inactivity
- 🔄 First request after spin-down takes ~30 seconds to wake up
- 💾 In-memory data (mock mode) resets on each deploy/restart

## Quick Deployment Checklist

- ✅ Code pushed to GitHub
- ✅ Render account created
- ✅ Repository connected to Render
- ✅ Environment variables configured
- ✅ Build & start commands set
- ✅ Deploy initiated
- ✅ Health check verified

## Troubleshooting

**Build fails:**
- Check that `package.json` and `package-lock.json` are in repo
- Verify Node.js version compatibility

**App doesn't start:**
- Check Render logs for errors
- Ensure `PORT` environment variable is set
- Verify all required env vars are present

**API errors in production:**
- Verify `API_TOKEN` is correct
- Check `BASE_URL` matches Dorra API
- Review Render logs for specific error messages

---

**You can deploy straight away with MOCK_API=true for demo purposes!**
