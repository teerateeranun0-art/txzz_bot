# 🛡️ Ultimate Enterprise Discord Bot

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v20%2B%20%7C%20v22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14.27.0-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B%20%7C%2015%2B%20%7C%2016%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Hybrid%20Cache%20%7C%20Memory%20Fallback-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Architecture](https://img.shields.io/badge/Architecture-Enterprise%20Grade%20%7C%20ACID%20Safe-00ADD8)](https://github.com/)

**Ultimate Enterprise Discord Bot** คือบอท Discord ระดับ Commercial & Production Grade ที่รวมระบบความปลอดภัยขั้นสูง (**Security / Anti-Raid / Anti-Nuke**), ระบบจัดการผู้ใช้ (**Advanced Moderation & AutoMod**), ระบบบริการลูกค้า (**Ticket / Support Hub**), ระบบเศรษฐกิจที่ปลอดภัยต่อการปั๊มเงินด้วย **PostgreSQL Strict ACID (`FOR UPDATE`) Transactions**, ระบบชุมชน/เกม และโครงสร้างพื้นฐานระดับสูง เช่น **Decoupled Job Queue (Worker System)**, **Redis Hybrid Cache**, **5-Tier Health Check Probe**, และ **Diagnostic Error Tracking System**

---

## 🏛️ สถาปัตยกรรมระบบ (System Architecture)

```mermaid
graph TD
    User["👤 Discord Users / Admins"] --> Gateway["📡 Discord Gateway (v14)"]
    Gateway --> Guard["🛡️ Global Guard & Rate Limiter\n(Sliding Window / Error Tracking)"]
    
    Guard --> Security["🔒 Security Core & Anti-Nuke\n• Action Rate Engine\n• Itemized Risk Breakdown\n• Auto-Incident Snapshot\n• Selective Safe Restore\n• Rogue Bot Quarantine"]
    Guard --> Router["⚡ Command & Event Router"]
    
    Router --> ModTicket["🔨 Moderation & Ticket Hub\n• AutoMod Engine\n• Case System & Mod Queue\n• Temp-Punish & Jails\n• HTML Transcripts"]
    Router --> Economy["💰 Strict ACID Economy\n• FOR UPDATE Row Locks\n• 0% Duplication Guarantee"]
    Router --> Diagnostics["📊 Observability & Health\n• /health 5-Tier Probe\n• /diagnose Error ID Lookup\n• Latency p50/p95/p99 Tracking"]
    
    Security & ModTicket & Economy --> StateLayer["⚡ Hybrid State & Queue Layer\n• Redis Cache / In-Memory TTL Fallback\n• Distributed Locks (Advisory / Redlock)\n• Decoupled Job Queue & DLQ"]
    
    StateLayer --> Workers["⚙️ Background Workers\n• Tempban & Jail Expiries\n• Reminders & Schedulers\n• Giveaways & Announcements\n• Daily Backup Rotator"]
    
    StateLayer --> PostgreSQL[("🐘 PostgreSQL Database\n• Advisory Migration Lock\n• JSONB Incident Snapshots\n• 7-Daily / 4-Weekly / 3-Monthly Retention")]
```

---

## 🚀 30 ระบบความพร้อมระดับ Production (30 Core Enterprise Systems)

| หมวดหมู่ | ระบบที่พัฒนา | รายละเอียดทางเทคนิค |
|---|---|---|
| **1. Security Core** | 1. Action Rate Engine<br>2. Custom Thresholds<br>3. Itemized Risk Score<br>4. Incident Timeline<br>5. Auto-Snapshot<br>6. Recovery Preview<br>7. Safe Restore Mode<br>8. Simulation Mode | • ตรวจจับความเร็วการกระทำ (Velocity) ต่อวินาที<br>• แต่ละกิลด์ตั้ง Threshold ผ่าน DB ได้เอง<br>• จำแนกคะแนนความเสี่ยงอย่างละเอียด (`+30 Mass Perms`, `+25 New Acc`, `-30 Trusted`)<br>• รวม Event เป็น Incident Session ID เดียวกัน<br>• ถ่าย Snapshot อัตโนมัติทันทีที่เกิดเหตุ Critical<br>• แสดง Diff Preview ก่อนกู้คืน และกู้คืนเฉพาะจุดที่เสียหาย (Selective Safe Restore)<br>• Simulation Mode สำหรับทดสอบโดยไม่ลงโทษจริง |
| **2. Anti-Nuke Matrix** | 9. Role Protection<br>10. Channel Protection<br>11. Member Mass Action<br>12. Webhook Protection<br>13. Rogue Bot Protection | • ป้องกันการลบ/สร้าง Role, Channel, หมวดหมู่, และ Webhook ผิดปกติ<br>• ป้องกันการเลื่อนขั้นสิทธิ์ (`ADMINISTRATOR`, `MANAGE_GUILD`, `MENTION_EVERYONE`)<br>• ดักจับบอทแปลกหน้าที่ถูกดึงเข้าเซิร์ฟเวอร์โดยไม่ได้รับอนุญาต (Auto-Quarantine & Strip Roles ทันที) |
| **3. Production Reliability** | 14. Hybrid Redis Cache<br>15. Decoupled Job Queue<br>16. Distributed Locks<br>17. Graceful Shutdown<br>18. Self-Healing & DLQ | • เชื่อมต่อ Redis อัตโนมัติ หรือ Fallback เป็น High-Performance In-Memory TTL Cache<br>• แยกงานหนักออกจาก Discord Gateway Loop สู่ Worker Queue พร้อม Dead-Letter Queue (DLQ)<br>• ล็อคแบบป้องกัน Deadlock ด้วยการจัดเรียงคีย์ตามตัวอักษร<br>• 5-Phase Graceful Shutdown (`SIGINT`/`SIGTERM`) เคลียร์ Queue และปิด Pool สะอาด 100% |
| **4. Database & Integrity** | 19. Backup Scheduler<br>20. Backup Retention<br>21. Migration Advisory Lock<br>22. Strict ACID Transactions | • สำรองข้อมูลฐานข้อมูลอัตโนมัติ (Daily, Weekly, Monthly)<br>• Retention Policy: เก็บ 7 Daily + 4 Weekly + 3 Monthly<br>• ใช้ `pg_try_advisory_lock` ป้องกัน Multi-Instance ชนกันตอนรัน Migration<br>• ทุกคำสั่งการเงิน (`/pay`, `/deposit`, `/withdraw`, `/rob`, `/gamble`) ใช้ `FOR UPDATE` Row Locks ป้องกันบั๊กปั๊มเงิน 0% Exploit |
| **5. API & Rate Limits** | 23. Global User Rate Limit<br>24. Guild Rate Ceiling<br>25. Discord REST Queue<br>26. Exponential Backoff | • จำกัดการยิงคำสั่งรายบุคคล (Max 5 cmds / 5s) และรายกิลด์<br>• REST Request Pipeline ควบคุม Concurrency ในการยิง Discord API<br>• Retry กลไก Exponential Backoff พร้อม Jitter เมื่อเจอ HTTP 429 หรือ 5xx |
| **6. Observability** | 27. 5-Tier Health Check<br>28. Error Tracking + IDs<br>29. Performance Metrics<br>30. Admin Diagnostics | • `/health` ตรวจสถานะ 5 ชั้น (Discord, PG, Redis, Queue, Node Runtime)<br>• Error Tracking ออกรหัส `ERR-XXXXXXXX` ให้ผู้ใช้ส่งตรวจสอบ และค้นหา Stack Trace ด้วย `/diagnose error`<br>• เก็บค่า Latency Percentiles (`p50`, `p95`, `p99`) และ Throughput (`/diagnose metrics`) |

---

## 🗺️ แผนผัง Roadmap 500 ฟีเจอร์ (Phases 1–6)

```
Phase 1: 1–100 Security & Anti-Raid  (🟢 Production Ready & Scalable)
Phase 2: 101–210 Moderation + Ticket (🟢 Complete Architecture)
Phase 3: 211–370 Community + Economy + Game (🟢 ACID Safe & Expandable)
Phase 4: 371–420 Automation Engine (🟡 Schedulers & Workers Active)
Phase 5: 421–460 Web Dashboard & REST API (⚪ Next Milestone)
Phase 6: 461–500 Advanced / Enterprise Core (🟢 Redis, Queue, Locks, Backups Active)
```

---

## 📋 คู่มือคำสั่งทั้งหมด (Command Reference)

### 🔒 1. ความปลอดภัย & กู้คืนเซิร์ฟเวอร์ (Security & Recovery)

| คำสั่ง | สิทธิ์ที่ต้องการ | คำอธิบาย |
|---|---|---|
| `/security dashboard` | Administrator | ดูภาพรวมสถานะความปลอดภัยของเซิร์ฟเวอร์ |
| `/security status` | Administrator | ตรวจสอบสถานะความปลอดภัยและ Lockdown ปัจจุบัน |
| `/security alerts` | Administrator | ดูรายการแจ้งเตือนความปลอดภัยล่าสุด |
| `/security config key:<key> value:<val>` | Administrator | ตั้งค่าเปิด/ปิดระบบความปลอดภัยหรือช่องแจ้งเตือน |
| `/score risk user:@user` | Moderate Members | **Itemized Risk Breakdown** — วิเคราะห์คะแนนความเสี่ยงพร้อมแจกแจงที่มาของคะแนน |
| `/score raid user:@user` | Moderate Members | ดูคะแนนความเป็นไปได้ในการเป็นบัญชี Raid |
| `/score trust user:@user` | Moderate Members | ดูคะแนนความน่าเชื่อถือของผู้ใช้ (0–100) |
| `/lockdown enable mode:<mode>` | Manage Guild | เปิดล็อคดาวน์ (`slowmode`, `verification`, `raid`, `maintenance`) |
| `/lockdown disable` | Manage Guild | ปลดล็อคดาวน์และคืนค่าสถานะปกติ |
| `/panic [reason]` | Administrator | **ปุ่มฉุกเฉิน** — ล็อคทุกช่องทันที + ถ่าย Snapshot + แจ้งเตือนเจ้าของเซิร์ฟเวอร์ผ่าน DM |
| `/snapshot create [label]` | Administrator | บันทึกภาพรวมโครงสร้างเซิร์ฟเวอร์ (Roles, Channels, Permissions) |
| `/snapshot diff id:<id>` | Administrator | **Diff Preview** — เปรียบเทียบความต่างระหว่าง Snapshot กับสถานะปัจจุบันก่อนกู้คืน |
| `/snapshot restore id:<id> type:<type>` | Administrator | **Safe Selective Restore** — กู้คืนเฉพาะจุดที่เสียหาย (`roles`, `channels`, `all`) |
| `/trusted add / remove / list` | Administrator | จัดการรายชื่อผู้ใช้ที่ได้รับความไว้วางใจ (Immunity) |
| `/trusted-role add / remove / list` | Administrator | จัดการยศที่ได้รับความไว้วางใจ |
| `/protected add / remove / list` | Administrator | กำหนด Role/Channel/Category/Webhook ที่ห้ามแก้ไขเด็ดขาด |
| `/quarantine user:@user / release / list` | Moderate Members | กักกัน/ปลดการกักกันสมาชิกที่น่าสงสัย (ถอดและเก็บยศชั่วคราว) |
| `/incident view id:<id> / history` | Moderate Members | ตรวจสอบบันทึกเหตุการณ์ความปลอดภัยและไทม์ไลน์ |

---

### 🏥 2. การวินิจฉัยและสังเกตการณ์ระบบ (Observability & Diagnostics)

| คำสั่ง | สิทธิ์ที่ต้องการ | คำอธิบาย |
|---|---|---|
| `/health` | Manage Guild | **5-Tier Health Probe** — ตรวจสุขภาพ Discord, Database, Redis, Queue, Memory |
| `/diagnose error id:ERR-XXXX` | Administrator | ค้นหาข้อมูล Context และ Stack Trace จาก Error ID ที่ผู้ใช้รายงาน |
| `/diagnose metrics` | Administrator | ดูสถิติความเร็วการตอบสนอง (`p50`, `p95`, `p99`), DB Latency, และ Throughput |
| `/diagnose backup action:create` | Administrator | สั่งสร้าง Snapshot สำรองข้อมูลฐานข้อมูลทันที |
| `/diagnose backup action:list` | Administrator | ดูประวัติไฟล์สำรองข้อมูลฐานข้อมูลที่มีอยู่ในระบบ |

---

### 🔨 3. ม็อดและระบบ AutoMod (Moderation & AutoMod)

| คำสั่ง | สิทธิ์ที่ต้องการ | คำอธิบาย |
|---|---|---|
| `/kick user:@user [reason]` | Kick Members | เตะสมาชิกออกจากเซิร์ฟเวอร์ พร้อมบันทึก Case ID |
| `/ban user:@user [reason]` | Ban Members | แบนสมาชิกถาวร พร้อมบันทึก Case ID |
| `/tempban user:@user duration:<time>` | Ban Members | แบนชั่วคราว (ปลดแบนอัตโนมัติผ่าน Job Queue) |
| `/unban user_id:<id> [reason]` | Ban Members | ปลดแบนสมาชิก |
| `/timeout user:@user duration:<time>` | Moderate Members | Mute สมาชิกชั่วคราว |
| `/untimeout user:@user` | Moderate Members | ยกเลิก Timeout |
| `/warn user:@user [points] [reason]` | Moderate Members | เตือนสมาชิกด้วยระบบ Warning Points |
| `/warnings user:@user` | Moderate Members | ดูประวัติการเตือนและคะแนนความประพฤติ |
| `/clearwarns user:@user` | Moderate Members | ล้างประวัติการเตือน |
| `/clear amount:<1-100>` | Manage Messages | ลบข้อความจำนวนมาก |
| `/jail user:@user duration:<time>` | Moderate Members | กักขังผู้ใช้ในห้องขังส่วนตัว (คืนยศอัตโนมัติเมื่อครบเวลา) |
| `/unjail user:@user` | Moderate Members | ปลดปล่อยผู้ใช้ออกจากห้องขัง |
| `/case view id:<id> / edit / search` | Moderate Members | ดู ค้นหา หรือแก้ไขบันทึก Case ม็อด |
| `/modnote add user:@user content:<text>` | Moderate Members | บันทึกหมายเหตุม็อดเกี่ยวกับผู้ใช้ (Staff Only) |
| `/modqueue` | Moderate Members | ตรวจสอบรายการร้องเรียนและคำขอยื่นอุทธรณ์ |
| `/appeal submit / review` | Everyone / Mod | ยื่นหรือตรวจสอบคำร้องขอยกเลิกโทษแบน |
| `/automod status` | Manage Guild | ดูสถานะการทำงานของตัวกรอง AutoMod ทั้งหมด |
| `/automod filter-add type:<type> pattern:<p>` | Manage Guild | เพิ่มตัวกรองคำหยาบ (Word), Regex, หรือ Domain Whitelist/Blacklist |

---

### 🎫 4. ระบบบริการลูกค้า (Ticket & Support)

| คำสั่ง | สิทธิ์ที่ต้องการ | คำอธิบาย |
|---|---|---|
| `/ticket setup channel:#ch` | Manage Channels | สร้าง Ticket Panel พร้อมปุ่มเปิด Ticket แยกตามหมวดหมู่ |
| `/ticket close [reason]` | In Ticket Channel | ปิด Ticket พร้อมบันทึก Transcript และขอคะแนนประเมิน (Feedback) |
| `/ticket claim` | In Ticket Channel | ทีมงานกดรับเคสเพื่อบันทึก SLA Response Time |
| `/ticket transfer staff:@staff` | In Ticket Channel | โอนย้ายเคส Ticket ไปให้ทีมงานท่านอื่น |
| `/ticket rename name:<new_name>` | In Ticket Channel | เปลี่ยนชื่อช่อง Ticket |
| `/ticket add user:@user` | In Ticket Channel | เพิ่มสมาชิกเข้ามาในห้อง Ticket |
| `/ticket remove user:@user` | In Ticket Channel | นำสมาชิกออกจากห้อง Ticket |
| `/ticket note content:<text>` | In Ticket Channel | เพิ่มบันทึกภายในสำหรับทีมงาน (ลูกค้าไม่เห็น) |
| `/ticket list` | Manage Channels | ดูรายการ Ticket ทั้งหมดที่กำลังเปิดอยู่ |
| `/ticket stats` | Manage Channels | สรุปสถิติประสิทธิภาพการทำงานของทีมงาน (Claims, Closes, SLA) |

---

### 💰 5. ระบบเศรษฐกิจ (Strict ACID Economy)

| คำสั่ง | คำอธิบาย |
|---|---|
| `/balance [user]` | ดูยอดเงินในกระเป๋า (Wallet) และธนาคาร (Bank) |
| `/daily` | รับเงินรายวัน (พร้อมระบบ Cooldown 24 ชั่วโมง) |
| `/work` | ทำงานหาเงิน (พร้อมระบบ Cooldown 1 ชั่วโมง) |
| `/pay user:@user amount:<amount>` | โอนเงินให้ผู้ใช้อื่น (**Protected by `FOR UPDATE` Row Locks**) |
| `/deposit amount:<amount>` | ฝากเงินเข้าธนาคาร (**ACID Safe**) |
| `/withdraw amount:<amount>` | ถอนเงินออกจากธนาคาร (**ACID Safe**) |
| `/gamble amount:<amount>` | เดิมพันเงินรางวัล (**ACID Safe**) |
| `/rob user:@user` | ปล้นเงินในกระเป๋าของผู้ใช้อื่น (มีความเสี่ยงโดนปรับ) |
| `/leaderboard` | จัดอันดับมหาเศรษฐีที่มีเงินรวมสูงสุดในเซิร์ฟเวอร์ |

---

### 👥 6. ระบบชุมชนและเลเวล (Community & Leveling)

| คำสั่ง | คำอธิบาย |
|---|---|
| `/welcome set channel:#ch message:<msg>` | ตั้งค่าระบบข้อความต้อนรับสมาชิกใหม่ |
| `/autorole role:@role` | ตั้งค่ายศอัตโนมัติเมื่อสมาชิกเข้าเซิร์ฟเวอร์ |
| `/rank [user]` | ดูการ์ดเลเวลและหลอดความคืบหน้า XP ปัจจุบัน |
| `/levelboard` | ดูตารางจัดอันดับเลเวลของเซิร์ฟเวอร์ |
| `/giveaway start prize:<p> duration:<d>` | สร้างกิจกรรมแจกของรางวัล (Auto-end ผ่าน Job Queue) |
| `/giveaway reroll id:<id>` | สุ่มผู้ชนะกิจกรรมใหม่ |
| `/suggest title:<t> description:<d>` | ส่งข้อเสนอแนะสำหรับเซิร์ฟเวอร์ พร้อมระบบโหวต |
| `/birthday set month:<m> day:<d>` | บันทึกวันเกิดสำหรับระบบอวยพรอัตโนมัติ |
| `/remind duration:<time> message:<msg>` | ตั้งเตือนความจำส่วนตัว (แจ้งเตือนผ่าน Job Queue) |
| `/afk [reason]` | ตั้งสถานะ AFK (แจ้งเตือนอัตโนมัติเมื่อมีคน Mention) |

---

## 🛠️ การติดตั้งและการรันใช้งาน (Installation & Setup)

### 1. ความต้องการของระบบ (Prerequisites)
- **Node.js**: v18.0.0 ขึ้นไป (แนะนำ Node.js v20 หรือ v22 LTS)
- **PostgreSQL**: v14+ (ฐานข้อมูลหลัก)
- **Redis** *(ตัวเลือกเสริม)*: v6+ (หากไม่มี ระบบจะสลับไปใช้ In-Memory Cache อัตโนมัติ)

### 2. โคลนโปรเจกต์และติดตั้ง Dependencies
```bash
git clone <repository-url>
cd BOT
npm install
```

### 3. กำหนดค่าตัวแปรสภาพแวดล้อม (`.env`)
คัดลอกไฟล์ตัวอย่าง `.env.example` เป็น `.env`:
```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id_here
GUILD_ID=your_development_guild_id_here
PREFIX=!

# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bot_db
DB_USER=postgres
DB_PASS=your_password_here
# หรือใช้ DATABASE_URL=postgresql://user:pass@host:5432/bot_db

# Redis Configuration (Optional - Memory Fallback automatically active if omitted)
# REDIS_URL=redis://localhost:6379
```

### 4. รัน Database Migration
```bash
npm run db:migrate
```

### 5. ลงทะเบียน Slash Commands เข้าสู่ Discord
```bash
npm run deploy
```

### 6. เริ่มการทำงานของบอท
```bash
# โหมดพัฒนา (Live Reload)
npm run dev

# โหมด Production
npm start
```

---

## 🧪 การทดสอบระบบ (Automated Test Suite)

รันชุดทดสอบความถูกต้องและ Integrity ของทั้ง 30 ระบบความพร้อมระดับ Production:
```bash
node "C:\Users\teera\.gemini\antigravity-ide\brain\aeb70408-6913-4155-b768-6b0a143e2d48\scratch\test-production-systems.js"
```

**สิ่งที่ชุดทดสอบตรวจสอบ:**
- ✅ Hybrid Cache (Serialization, TTL Expiry, Key Deletions)
- ✅ Deadlock-Safe Distributed Locks (Alphabetical order & Concurrency safety)
- ✅ Exponential Backoff Retry Manager (Transient failure recovery)
- ✅ Error Tracker Context & Unique Error ID Resolution
- ✅ Latency Percentile Calculation (`p50`, `p95`, `p99`) & Throughput Tracking
- ✅ Itemized Risk Score Breakdown & Penalty Factor Calculation
- ✅ Decoupled Job Queue Execution & Worker Task Dispatching

---

## 🚢 การ Deploy บน Production (PM2 Setup)

สำหรับการรันบน Cloud/VPS แนะนำให้ใช้งานร่วมกับ **PM2** เพื่อรองรับ Auto-Restart และ Monitoring:

```bash
# ติดตั้ง PM2
npm install -g pm2

# เริ่มทำงานบอท
pm2 start src/index.js --name "ultimate-bot"

# ดูสถานะและ Log
pm2 status
pm2 logs ultimate-bot
```

เมื่อมีสัญญาณ `SIGINT` หรือ `SIGTERM` บอทจะเริ่มกระบวนการ **5-Phase Graceful Shutdown** อัตโนมัติ:
1. หยุดรับงานใหม่และตั้งสถานะเป็น Invisible
2. ทยอยเคลียร์งานใน Worker Job Queue จนเสร็จสิ้น (Grace Timeout 10s)
3. ปิดการเชื่อมต่อ Discord WebSocket Gateway
4. Flush แคชและปิด Connection Pools ของ Redis & PostgreSQL
5. จบ Process อย่างปลอดภัย ไม่ทิ้ง Transaction ค้างในฐานข้อมูล

---

## 📄 License
This project is licensed under the **MIT License**.
