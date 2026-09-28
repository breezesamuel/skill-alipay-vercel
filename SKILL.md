---
name: "Alipay Payment Integration for Vercel/Next.js"
description: "Production-ready Alipay payment integration with webhook verification, order persistence (Vercel KV/Upstash), multi-plan support, and referral commissions. Used by 508-tool site processing real payments."
version: "1.0.0"
price: "29.00 USD"
wallet_address: "0x12A2b19eFA9D8BC48ac156Cc8FdfC7cC0Dff36aB"
category: "payments"
tags: ["alipay", "vercel", "nextjs", "payments", "webhooks", "kv"]
author: "breezesamuel"
license: "MIT"
repository: "https://github.com/breezesamuel/skill-alipay-vercel"
documentation: "https://github.com/breezesamuel/skill-alipay-vercel/blob/main/README.md"
---
# Alipay Payment Integration for Vercel/Next.js

## Overview
Complete, production-hardened Alipay integration for serverless Vercel/Next.js deployments. Handles the full payment lifecycle: order creation → Alipay gateway redirect → async webhook verification → order persistence → referral commission calculation.

## Features
- **Alipay Gateway**: RSA-SHA256 signing, AES encryption for sensitive params
- **Multi-plan Support**: Monthly (¥10/30/100), Yearly (¥99/299/999), Time-based (¥6-2000)
- **Referral System**: Ladder commissions (10%-70% based on invite count)
- **Persistent Orders**: Vercel KV (Upstash Redis) with Supabase fallback, in-memory fallback
- **Webhook Security**: Async notify verification with signature validation
- **Refund Support**: Full/partial refund via Alipay API
- **Zero-config Deploy**: Environment variables only, works on Vercel edge/node

## Quick Start
```bash
# Install dependencies
npm install alipay-sdk

# Set environment variables
ALIPAY_APP_ID=your_app_id
ALIPAY_MERCHANT_PRIVATE_KEY=your_pkcs8_private_key
ALIPAY_ALIPAY_PUBLIC_KEY=alipay_public_key
ALIPAY_ACCOUNT=your_alipay_account
KV_REST_API_URL=your_upstash_redis_url
KV_REST_API_TOKEN=your_upstash_token
```

## API Endpoints
- `GET /api/pay?plan=m10&slug=tool-name&ref=user123` → Returns Alipay checkout HTML
- `POST /api/notify` → Alipay async webhook (auto-verifies & persists)
- `GET /api/order?out_trade_no=xxx` → Query order status
- `GET /api/entitle?ref=user123` → Get unlocked tools for user
- `GET /api/health` → Health check (shows store: kv/supabase/memory)

## Architecture
```
Client → /api/pay → Alipay Gateway → User Pays → Alipay Notify → /api/notify → KV Store
                ↓
         Order Created (status: created)
                ↓
         Webhook Verified → Order Updated (status: paid)
```

## Testing
```bash
# Local dev
vercel dev

# Test payment flow
curl "http://localhost:3000/api/pay?plan=m10&slug=test-tool&ref=test-user"
```

## Production Checklist
- [ ] Alipay app configured for production (not sandbox)
- [ ] Vercel KV/Upstash provisioned and connected
- [ ] Webhook URL configured in Alipay merchant console
- [ ] Domain verified for Alipay callback
- [ ] SSL/TLS enforced on all endpoints

## Revenue Proof
Live at `https://app.highkingflower.com` processing real Alipay payments to `supi24@163.com` with plans from ¥10-¥2000.

## Support
Issues: https://github.com/breezesamuel/skill-alipay-vercel/issues