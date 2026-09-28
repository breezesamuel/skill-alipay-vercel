# Alipay Payment Integration for Vercel/Next.js

Production-ready Alipay payment integration used by a 508-tool site processing real payments.

## Files
- `SKILL.md` — SkillShop manifest (price: $29, USDC on Base)
- `alipay.js` — Complete serverless function (334 lines)
- `package.json` — Dependencies
- `vercel.json` — Vercel deployment config

## Deploy to Vercel
1. Fork this repo
2. `vercel` → auto-detects Node.js
3. Add environment variables (see SKILL.md)
4. Provision Vercel KV (Upstash) → `vercel integration add upstash/upstash-kv`
5. Deploy

## License
MIT