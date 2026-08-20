# 🛡️ Ultimate Enterprise Discord Bot

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v20%2B%20%7C%20v22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14.27.0-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Hybrid%20Cache-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**บอท Discord ระดับ Production-Grade สำหรับเซิร์ฟเวอร์ขนาดใหญ่**  
ครอบคลุมทุกระบบ — ความปลอดภัย · ม็อด · ยืนยันตัวตน · เศรษฐกิจ · ชุมชน · Ticket · Dashboard

</div>

---

## 📋 สารบัญ (Table of Contents)

- [ภาพรวมระบบ](#-ภาพรวมระบบ-system-overview)
- [สถาปัตยกรรม](#️-สถาปัตยกรรมระบบ-architecture)
- [คุณสมบัติทั้งหมด](#-คุณสมบัติ-features)
- [คู่มือคำสั่ง](#-คู่มือคำสั่ง-command-reference)
- [การติดตั้ง](#️-การติดตั้ง-installation)
- [การตั้งค่า .env](#-การตั้งค่า-environment)
- [โครงสร้างโปรเจกต์](#-โครงสร้างโปรเจกต์)
- [การทดสอบ](#-การทดสอบ-test-suite)
- [Production Deployment](#-production-deployment)
- [License](#-license)

---

## 🚀 ภาพรวมระบบ (System Overview)

**Ultimate Enterprise Discord Bot** คือบอท Discord ระดับ Commercial ที่พัฒนาด้วย **Node.js ESM** และ **Discord.js v14** รวมระบบครบวงจรสำหรับเซิร์ฟเวอร์ขนาดใหญ่:

| หมวดหมู่ | ระบบหลัก |
|---|---|
| 🔒 **Security** | Anti-Raid, Anti-Nuke, Risk Scoring, Auto-Snapshot, Safe Restore |
| 🎖️ **Verification** | Instant/Captcha Panel, Role Assignment, Jail/Quarantine Guard |
| 🔨 **Moderation** | AutoMod Engine, Case System, Jail, Tempban, Quarantine |
| 🎫 **Ticket** | Multi-Panel, HTML Transcript, SLA Tracking, Staff Claims |
| 💰 **Economy** | ACID Transactions, FOR UPDATE Locks, Double-Entry Ledger |
| 👥 **Community** | Levels/XP, Giveaways, Reaction Roles, Counting, Word Chain |
| 📊 **Dashboard** | Web REST API, AutoMod Management, Server Statistics |
| ⚙️ **Infrastructure** | Job Queue, DLQ, Redis Cache, 5-Phase Graceful Shutdown |

---

## 🏛️ สถาปัตยกรรมระบบ (Architecture)

```mermaid
graph TD
    User["👤 Discord Users / Admins"] --> Gateway["📡 Discord Gateway (v14)"]
    Gateway --> Guard["🛡️ Global Guard & Rate Limiter\n(Sliding Window / Error Tracking)"]

    Guard --> Security["🔒 Security & Anti-Nuke Core\n• Action Rate Engine\n• Itemized Risk Score\n• Auto-Snapshot & Safe Restore\n• Simulation Mode"]
    Guard --> Router["⚡ Command & Event Router"]

    Router --> Verify["🎖️ Verification System\n• Instant / Captcha Mode\n• Jail & Quarantine Guard\n• Unverified Role Auto-Assign"]
    Router --> ModTicket["🔨 Moderation & Ticket Hub\n• AutoMod Engine\n• Case System & Mod Queue\n• Temp-Punish & Jails\n• HTML Transcripts"]
    Router --> Economy["💰 Strict ACID Economy\n• FOR UPDATE Row Locks\n• 0% Duplication Guarantee\n• Double-Entry Ledger"]

    Security & Verify & ModTicket & Economy --> StateLayer["⚡ Hybrid State Layer\n• Redis Cache / In-Memory Fallback\n• Distributed Locks (Deadlock-Safe)\n• Decoupled Job Queue & DLQ"]

    StateLayer --> Workers["⚙️ Background Workers\n• Tempban & Jail Expiries\n• Reminders & Giveaways\n• Announcement Scheduler"]
    StateLayer --> PostgreSQL[("🐘 PostgreSQL\n• ACID Transactions\n• Advisory Migration Lock\n• 7-Daily / 4-Weekly / 3-Monthly Backup")]
    StateLayer --> Dashboard["🌐 Web Dashboard\n• REST API (HTTP)\n• AutoMod Management\n• Server Stats"]
```

---

## ✨ คุณสมบัติ (Features)

### 🔒 Security & Anti-Nuke (ระบบความปลอดภัย)
- **Action Rate Engine** — ตรวจจับความเร็วในการกระทำผิดปกติ (Velocity Detection)
- **Itemized Risk Score** — วิเคราะห์คะแนนความเสี่ยงอย่างละเอียด เช่น `+30 Mass Perms`, `+25 New Account`, `-30 Trusted Role`
- **Auto-Snapshot** — ถ่ายภาพโครงสร้างเซิร์ฟเวอร์อัตโนมัติทันทีที่เกิดเหตุ Critical
- **Selective Safe Restore** — กู้คืนเฉพาะส่วนที่เสียหายพร้อม Diff Preview ก่อนยืนยัน
- **Simulation Mode** — ทดสอบระบบลงโทษโดยไม่กระทบสมาชิกจริง
- **Rogue Bot Quarantine** — ตรวจจับและกักกันบอทที่ถูกดึงเข้าเซิร์ฟโดยไม่ได้รับอนุญาต
- **Anti-Nuke Matrix** — ป้องกันการลบ Role/Channel/Webhook และการเลื่อนขั้นสิทธิ์จำนวนมาก

### 🎖️ Verification System (ระบบยืนยันตัวตนเพื่อรับยศ) *(ใหม่)*
- **Instant Mode** — กดปุ่มเดียวรับยศทันที
- **Captcha Mode** — สุ่มรหัส 5 ตัวอักษร ป้องกันสคริปต์บอทอัตโนมัติ
- **Unverified Role Integration** — มอบยศ "ยังไม่ยืนยัน" อัตโนมัติเมื่อสมาชิกเข้าเซิร์ฟ ลบออกเมื่อยืนยันสำเร็จ
- **Jail/Quarantine Guard** — สมาชิกที่ถูกกักบริเวณหรือกักกันความปลอดภัยไม่สามารถรับยศได้
- **Raid Lockdown Guard** — หยุดระบบยืนยันอัตโนมัติระหว่าง Raid/Lockdown
- **Verification Audit Log** — บันทึกประวัติการยืนยันตัวตนพร้อมสถิติ
- **Custom Embed** — ปรับแต่งหัวข้อ คำอธิบาย สีปุ่ม และข้อความปุ่มได้เต็มรูปแบบ

### 🔨 Moderation & AutoMod
- **Case System** — บันทึกและค้นหาประวัติการลงโทษด้วย Case ID
- **AutoMod Engine** — กรองสแปม, ข้อความซ้ำ, ลิงก์, คำหยาบ, Regex, Invite, Domain
- **Jail System** — กักขังผู้ใช้ในห้องส่วนตัว บันทึก/คืนยศอัตโนมัติ
- **Tempban** — แบนชั่วคราว ปลดแบนอัตโนมัติผ่าน Job Queue
- **Warning Points** — ระบบเตือนพร้อม Auto-Escalation ตาม Threshold ที่กำหนด
- **Punishment Rules** — กำหนดกฎการลงโทษอัตโนมัติตามคะแนนสะสม
- **Mod Queue** — คิวการจัดการรายงานและอุทธรณ์โทษ

### 🎫 Ticket & Support Hub
- **Multi-Panel** — สร้าง Ticket Panel หลายอันในหลายช่อง แยกตามหมวดหมู่
- **HTML Transcript** — บันทึกประวัติการสนทนาเมื่อปิด Ticket
- **SLA Tracking** — บันทึกเวลาตอบสนองของทีมงาน (Claim to Close)
- **Staff Claims** — ทีมงานกดรับเคส, โอน, เพิ่ม/ลบสมาชิก
- **Internal Notes** — หมายเหตุภายในที่ลูกค้ามองไม่เห็น
- **Feedback System** — ขอคะแนนประเมินความพึงพอใจเมื่อปิด Ticket

### 💰 Economy System (ระบบเศรษฐกิจ ACID)
- ทุกธุรกรรมการเงินใช้ **PostgreSQL `FOR UPDATE` Row Locks** ป้องกันการปั๊มเงิน 100%
- **Double-Entry Ledger** — บันทึกบัญชีคู่สำหรับ Audit Trail ครบถ้วน
- **Idempotency Keys** — ป้องกันการทำรายการซ้ำซ้อน
- รองรับ: ฝาก/ถอน/โอน/ปล้น/เดิมพัน/รายวัน/ทำงาน/ลีดเดอร์บอร์ด

### 👥 Community & Leveling
- **XP/Level System** — สะสม XP จากการพูดคุย พร้อมการ์ดแสดงผล
- **Giveaways** — สร้างกิจกรรมแจกรางวัล จบอัตโนมัติผ่าน Job Queue
- **Reaction Roles** — มอบยศเมื่อกด Emoji ในข้อความ
- **Birthday System** — อวยพรวันเกิดอัตโนมัติ
- **Counting Game & Word Chain** — เกมชุมชนสร้างความสัมพันธ์
- **Starboard** — รวบรวมข้อความที่ได้รับ Star สูงสุด
- **Announcement Scheduler** — กำหนดเวลาประกาศข้อความอัตโนมัติ

### ⚙️ Infrastructure
- **Decoupled Job Queue** — แยกงานหนักออกจาก Gateway Event Loop พร้อม Dead-Letter Queue (DLQ)
- **Hybrid Redis Cache** — เชื่อม Redis อัตโนมัติ หรือ Fallback เป็น In-Memory TTL Cache
- **5-Phase Graceful Shutdown** — ปิดระบบสะอาด 100% ไม่ทิ้ง Transaction ค้าง
- **5-Tier Health Check** — ตรวจสุขภาพ Discord, PostgreSQL, Redis, Queue, Node Runtime
- **Error Tracker** — ออกรหัส `ERR-XXXXXXXX` สำหรับค้นหา Stack Trace ย้อนหลัง
- **Database Backup** — สำรองข้อมูลอัตโนมัติ (Daily/Weekly/Monthly) พร้อม Retention Policy

---

## 📖 คู่มือคำสั่ง (Command Reference)

### 🛡️ Security & Recovery

| คำสั่ง | สิทธิ์ | คำอธิบาย |
|---|---|---|
| `/security dashboard` | Administrator | ภาพรวมสถานะความปลอดภัยทั้งหมด |
| `/security status` | Administrator | สถานะความปลอดภัยและ Lockdown ปัจจุบัน |
| `/security alerts` | Administrator | รายการแจ้งเตือนความปลอดภัยล่าสุด |
| `/security config` | Administrator | ตั้งค่าเปิด/ปิดระบบความปลอดภัย |
| `/lockdown enable mode:<mode>` | Manage Guild | เปิดล็อคดาวน์ (`slowmode` / `verification` / `raid` / `maintenance`) |
| `/lockdown disable` | Manage Guild | ปลดล็อคดาวน์ |
| `/panic [reason]` | Administrator | **ปุ่มฉุกเฉิน** — ล็อคทุกช่องทันที + ถ่าย Snapshot + DM เจ้าของเซิร์ฟ |
| `/raidmode enable/disable` | Manage Guild | เปิด/ปิดโหมดป้องกัน Raid |
| `/score risk user:@user` | Moderate Members | วิเคราะห์คะแนนความเสี่ยงพร้อมแจกแจงที่มา |
| `/score raid user:@user` | Moderate Members | ดูคะแนนความเป็นไปได้ Raid Account |
| `/score trust user:@user` | Moderate Members | ดูคะแนนความน่าเชื่อถือ (0–100) |
| `/snapshot create [label]` | Administrator | ถ่ายภาพโครงสร้างเซิร์ฟเวอร์ |
| `/snapshot diff id:<id>` | Administrator | เปรียบเทียบ Snapshot กับปัจจุบัน (Diff Preview) |
| `/snapshot restore id:<id> type:<type>` | Administrator | กู้คืนเฉพาะส่วนที่เสียหาย (`roles` / `channels` / `all`) |
| `/trusted add/remove/list` | Administrator | จัดการรายชื่อผู้ใช้ที่ได้รับ Immunity |
| `/trusted-role add/remove/list` | Administrator | จัดการยศที่ได้รับ Immunity |
| `/protected add/remove/list` | Administrator | กำหนด Role/Channel ที่ห้ามแก้ไขเด็ดขาด |
| `/quarantine user:@user/release/list` | Moderate Members | กักกัน/ปลด/ดูรายชื่อสมาชิกที่น่าสงสัย |
| `/incident view id:<id>/history` | Moderate Members | ตรวจสอบบันทึก Security Incident และ Timeline |

---

### 🎖️ Verification (ระบบยืนยันตัวตน)

| คำสั่ง | สิทธิ์ | คำอธิบาย |
|---|---|---|
| `/verify setup channel:#ch role:@role` | Manage Roles | สร้างหน้าต่างยืนยันตัวตน พร้อมกำหนดยศและรูปแบบ |
| `/verify setup ... mode:captcha` | Manage Roles | เปิดใช้งาน Captcha Modal (ปลอดภัยสูง) |
| `/verify setup ... unverified_role:@role` | Manage Roles | กำหนดยศ "ยังไม่ยืนยัน" ที่จะลบออกอัตโนมัติ |
| `/verify setup ... log_channel:#ch` | Manage Roles | กำหนดช่อง Log การยืนยันตัวตน |
| `/verify status` | Manage Roles | ดูสถานะ, สถิติผู้ยืนยัน และประวัติล่าสุด |
| `/verify test` | Manage Roles | ดูตัวอย่างหน้าต่างยืนยันตัวตน (Ephemeral Preview) |
| `/verify disable` | Manage Roles | ปิดการใช้งานและลบการตั้งค่า |

> **⚙️ พารามิเตอร์เพิ่มเติมสำหรับ `/verify setup`:**  
> `title` · `description` · `button_text` · `button_style` (🟢เขียว / 🔵น้ำเงิน / ⚪เทา / 🔴แดง)

> **🔐 การป้องกัน:**  
> สมาชิกที่อยู่ใน Jail หรือ Quarantine จะ**ไม่สามารถรับยศ**ได้จากระบบนี้  
> ระบบหยุดทำงานอัตโนมัติเมื่อเซิร์ฟเวอร์อยู่ใน Raid/Verification Lockdown

---

### 🔨 Moderation & AutoMod

| คำสั่ง | สิทธิ์ | คำอธิบาย |
|---|---|---|
| `/kick user:@user [reason]` | Kick Members | เตะสมาชิก พร้อมบันทึก Case ID |
| `/ban user:@user [reason]` | Ban Members | แบนถาวร พร้อมบันทึก Case ID |
| `/unban user_id:<id>` | Ban Members | ปลดแบน |
| `/tempban user:@user duration:<time>` | Ban Members | แบนชั่วคราว (ปลดแบนอัตโนมัติ) |
| `/timeout user:@user duration:<time>` | Moderate Members | Mute ชั่วคราว |
| `/untimeout user:@user` | Moderate Members | ยกเลิก Timeout |
| `/warn user:@user [points] [reason]` | Moderate Members | เตือนด้วยระบบ Warning Points |
| `/warnings user:@user` | Moderate Members | ดูประวัติการเตือนและคะแนน |
| `/clearwarns user:@user` | Moderate Members | ล้างประวัติการเตือน |
| `/clear amount:<1-100>` | Manage Messages | ลบข้อความจำนวนมาก |
| `/slowmode seconds:<s>` | Manage Channels | ตั้ง Slow Mode |
| `/lock / /unlock` | Manage Channels | ล็อค/ปลดล็อคช่อง |
| `/nick user:@user name:<name>` | Manage Nicknames | เปลี่ยนชื่อเล่น |
| `/jail user:@user duration:<time>` | Moderate Members | กักขังผู้ใช้ในห้องขังส่วนตัว |
| `/unjail user:@user` | Moderate Members | ปลดปล่อยจากห้องขัง |
| `/jail-list` | Moderate Members | ดูรายชื่อผู้ถูกกักขังทั้งหมด |
| `/temprole user:@user role:@role duration:<time>` | Manage Roles | ให้ยศชั่วคราว (คืนอัตโนมัติ) |
| `/case view id:<id>` | Moderate Members | ดูรายละเอียด Case |
| `/case search user:@user` | Moderate Members | ค้นหาประวัติ Case ของผู้ใช้ |
| `/case edit id:<id>` | Moderate Members | แก้ไขบันทึก Case |
| `/modnote add user:@user content:<text>` | Moderate Members | เพิ่มหมายเหตุม็อด (Staff Only) |
| `/punish-rule add/remove/list` | Administrator | ตั้งกฎการลงโทษอัตโนมัติตาม Warning Points |
| `/report user:@user reason:<text>` | Everyone | รายงานสมาชิก |
| `/modqueue view/resolve/history` | Moderate Members | จัดการคิวรายงาน |
| `/appeal submit/review` | Everyone / Mod | ยื่น/ตรวจสอบอุทธรณ์ |
| `/automod status` | Manage Guild | ดูสถานะ Filter AutoMod ทั้งหมด |
| `/automod spam/flood/caps/emoji/...` | Manage Guild | เปิด/ปิดและตั้งค่า Filter แต่ละประเภท |
| `/automod filter-add type:<type> pattern:<p>` | Manage Guild | เพิ่ม Filter คำหยาบ/Regex/Domain |
| `/automod filter-remove id:<id>` | Manage Guild | ลบ Filter |
| `/automod filter-list` | Manage Guild | ดูรายการ Filter ทั้งหมด |
| `/automod whitelist-role role:@role` | Manage Guild | ยกเว้น Role จากการถูก AutoMod |
| `/automod whitelist-channel channel:#ch` | Manage Guild | ยกเว้นช่องจากการถูก AutoMod |

---

### 🎫 Ticket & Support

| คำสั่ง | สิทธิ์ | คำอธิบาย |
|---|---|---|
| `/ticket setup channel:#ch` | Manage Channels | สร้าง Ticket Panel พร้อมปุ่มเปิด Ticket |
| `/ticket close [reason]` | In Ticket | ปิด Ticket พร้อม Transcript และขอ Feedback |
| `/ticket claim` | Staff | รับเคสและบันทึก SLA Response Time |
| `/ticket transfer staff:@staff` | Staff | โอนเคสให้ทีมงานอื่น |
| `/ticket rename name:<name>` | Staff | เปลี่ยนชื่อช่อง Ticket |
| `/ticket add user:@user` | Staff | เพิ่มสมาชิกเข้าห้อง Ticket |
| `/ticket remove user:@user` | Staff | นำสมาชิกออกจากห้อง Ticket |
| `/ticket note content:<text>` | Staff | เพิ่มหมายเหตุภายใน (ลูกค้าไม่เห็น) |
| `/ticket list` | Manage Channels | ดูรายการ Ticket ที่กำลังเปิด |
| `/ticket stats` | Manage Channels | สถิติประสิทธิภาพทีมงาน |

---

### 💰 Economy (ระบบเศรษฐกิจ ACID)

| คำสั่ง | คำอธิบาย |
|---|---|
| `/balance [user]` | ดูยอดเงินในกระเป๋า (Wallet) และธนาคาร (Bank) |
| `/daily` | รับเงินรายวัน (Cooldown 24 ชั่วโมง) |
| `/work` | ทำงานหาเงิน (Cooldown 1 ชั่วโมง) |
| `/pay user:@user amount:<n>` | โอนเงิน (**`FOR UPDATE` Row Lock** — ปลอดภัย 100%) |
| `/deposit amount:<n>` | ฝากเงินเข้าธนาคาร (**ACID Safe**) |
| `/withdraw amount:<n>` | ถอนเงินจากธนาคาร (**ACID Safe**) |
| `/gamble amount:<n>` | เดิมพัน (**ACID Safe**) |
| `/rob user:@user` | ปล้นเงินในกระเป๋า (มีความเสี่ยง) |
| `/leaderboard` | อันดับมหาเศรษฐีในเซิร์ฟเวอร์ |

---

### 👥 Community & Leveling

| คำสั่ง | คำอธิบาย |
|---|---|
| `/verify setup` | **[ใหม่]** สร้างหน้าต่างยืนยันตัวตนรับยศ |
| `/autorole role:@role` | ตั้งยศอัตโนมัติเมื่อสมาชิกเข้าเซิร์ฟ |
| `/welcome set channel:#ch message:<msg>` | ตั้งค่าข้อความต้อนรับ |
| `/rank [user]` | ดูการ์ดเลเวลและ XP |
| `/levelboard` | จัดอันดับเลเวลของเซิร์ฟเวอร์ |
| `/giveaway start prize:<p> duration:<d>` | สร้างกิจกรรมแจกของรางวัล |
| `/giveaway reroll id:<id>` | สุ่มผู้ชนะใหม่ |
| `/giveaway end id:<id>` | จบกิจกรรมก่อนกำหนด |
| `/suggest title:<t> description:<d>` | ส่งข้อเสนอแนะพร้อมโหวต |
| `/birthday set month:<m> day:<d>` | บันทึกวันเกิดสำหรับระบบอวยพรอัตโนมัติ |
| `/announce channel:#ch message:<msg>` | ส่งประกาศ (รองรับ Scheduled) |
| `/counting setup/stats` | ตั้งเกมนับเลขในช่อง |
| `/wordchain setup/stats` | ตั้งเกมต่อคำ |
| `/reactionrole add/remove/list` | จัดการ Reaction Role |
| `/starboard setup channel:#ch` | ตั้งช่อง Starboard |
| `/afk [reason]` | ตั้งสถานะ AFK |
| `/remind duration:<time> message:<msg>` | ตั้งเตือนความจำผ่าน Job Queue |

---

### 🛠️ System & Diagnostics

| คำสั่ง | สิทธิ์ | คำอธิบาย |
|---|---|---|
| `/health` | Manage Guild | **5-Tier Health Probe** — ตรวจ Discord, DB, Redis, Queue, Memory |
| `/diagnose error id:ERR-XXXX` | Administrator | ค้นหา Stack Trace จาก Error ID |
| `/diagnose metrics` | Administrator | สถิติ Latency (`p50` / `p95` / `p99`) และ Throughput |
| `/diagnose backup action:create` | Administrator | สั่ง Backup ฐานข้อมูลทันที |
| `/diagnose backup action:list` | Administrator | ดูรายการไฟล์ Backup |
| `/ping` | Everyone | วัด Latency และ Heartbeat |
| `/botinfo` | Everyone | ดูข้อมูลบอทและสถิติระบบ |
| `/serverinfo` | Everyone | ดูข้อมูลเซิร์ฟเวอร์ |
| `/userinfo [user]` | Everyone | ดูข้อมูลผู้ใช้ |
| `/invite` | Everyone | รับลิงก์เชิญบอท |
| `/help [category]` | Everyone | แสดงคำสั่งแยกตามหมวดหมู่ |

---

### 🎮 Fun & Utility

| คำสั่ง | คำอธิบาย |
|---|---|
| `/8ball question:<q>` | ถามลูกบอล 8 ทาย |
| `/coinflip` | โยนเหรียญ |
| `/dice [sides]` | ทอยลูกเต๋า |
| `/rps choice:<choice>` | เล่นเป่ายิงฉุบกับบอท |
| `/joke` | บอกตลก |
| `/choose option1 option2 ...` | สุ่มเลือก |
| `/reverse text:<text>` | กลับข้อความ |
| `/emojify text:<text>` | แปลงเป็น Emoji |
| `/ascii text:<text>` | แปลงเป็น ASCII Art |
| `/poll question:<q> options:<o>` | สร้างโพลล์โหวต |
| `/embed title:<t> description:<d>` | ส่งข้อความเป็น Embed |
| `/say channel:#ch message:<msg>` | ให้บอทพูดแทน |
| `/calc expression:<expr>` | คำนวณสูตรคณิตศาสตร์ |
| `/base64 encode/decode text:<text>` | แปลง Base64 |
| `/password [length]` | สร้างรหัสผ่านสุ่ม |
| `/qr text:<text>` | สร้าง QR Code |
| `/avatar [user]` | ดูรูปโปรไฟล์ขนาดใหญ่ |

---

## 🛠️ การติดตั้ง (Installation)

### ความต้องการของระบบ

| ซอฟต์แวร์ | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| **Node.js** | v18.0.0+ | แนะนำ v20 หรือ v22 LTS |
| **PostgreSQL** | v14+ | ฐานข้อมูลหลัก |
| **Redis** | v6+ | *(ตัวเลือกเสริม — มี In-Memory Fallback อัตโนมัติ)* |

### ขั้นตอนการติดตั้ง

```bash
# 1. Clone โปรเจกต์
git clone <repository-url>
cd BOT

# 2. ติดตั้ง Dependencies
npm install

# 3. คัดลอกและแก้ไขไฟล์ตั้งค่า
cp .env.example .env
# แก้ไขค่าใน .env ตามที่กำหนดด้านล่าง

# 4. รัน Database Migration
npm run db:migrate

# 5. ลงทะเบียน Slash Commands
npm run deploy

# 6. เริ่มบอท
npm run dev    # โหมดพัฒนา (Live Reload)
npm start      # โหมด Production
```

---

## ⚙️ การตั้งค่า Environment

สร้างไฟล์ `.env` ที่ Root ของโปรเจกต์:

```env
# ─── Discord ───────────────────────────────────────
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id_here
GUILD_ID=your_development_guild_id     # สำหรับ dev: deploy คำสั่งเข้า Guild เดียว

# ─── PostgreSQL ────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bot_db
DB_USER=postgres
DB_PASS=your_password_here
# หรือใช้ Connection String
# DATABASE_URL=postgresql://user:pass@localhost:5432/bot_db

# ─── Redis (ตัวเลือกเสริม) ─────────────────────────
# หากไม่ตั้ง ระบบจะใช้ In-Memory Cache อัตโนมัติ
# REDIS_URL=redis://localhost:6379

# ─── Dashboard (ตัวเลือกเสริม) ────────────────────
# DASHBOARD_PORT=3000

# ─── Bot Settings ──────────────────────────────────
# PREFIX=!
```

---

## 📁 โครงสร้างโปรเจกต์

```
BOT/
├── src/
│   ├── commands/           # Slash Command handlers (verify, moderation, economy, ...)
│   ├── community/          # ระบบชุมชน (verification.js, ...)
│   ├── dashboard/          # Web Dashboard REST API
│   ├── database/           # Migration scripts & backup tools
│   ├── events/             # Discord Event handlers
│   │   ├── interactionCreate.js   # ✦ Command + Button + Modal router
│   │   ├── guildMemberAdd.js      # ✦ Auto-role & Unverified role assignment
│   │   └── ...
│   ├── handlers/           # Command & Event loader
│   ├── moderation/         # Jail, Appeals, Case Manager
│   ├── security/           # Anti-Raid, Lockdown, Actions, Engine
│   ├── tickets/            # Ticket Manager, Feedback, Transcript
│   └── utils/
│       ├── database.js     # ✦ ฟังก์ชันฐานข้อมูลทั้งหมด + In-Memory Fallback
│       ├── queue.js        # ✦ Job Queue + DLQ + getDeadLetters/getActiveCount
│       ├── redis.js        # Hybrid Cache
│       ├── health.js       # 5-Tier Health Check
│       ├── metrics.js      # Latency Percentile Tracking
│       └── ...
├── tests/
│   ├── concurrency.test.js     # ACID + Idempotency + Ledger Tests
│   ├── failure.test.js         # Redis Fallback + DLQ + Drain Tests
│   ├── integration.test.js     # Security Scoring + Subscription + Queue Tests
│   ├── dashboard-automod.test.js
│   └── verification.test.js    # ✦ Verification System Tests (18/18)
├── src/database/
│   └── all_migrations.sql      # SQL Schema ทั้งหมด (รวม verification_configs/logs)
├── package.json
└── .env
```

---

## 🧪 การทดสอบ (Test Suite)

รันชุดทดสอบอัตโนมัติครอบคลุมทุกระบบหลัก:

```bash
# ทดสอบทั้งหมด
node tests/concurrency.test.js
node tests/failure.test.js
node tests/integration.test.js
node tests/dashboard-automod.test.js
node tests/verification.test.js
```

### ผลการทดสอบล่าสุด

| ชุดทดสอบ | ไฟล์ | ผล |
|---|---|---|
| **Verification System** | `tests/verification.test.js` | ✅ **18/18 PASSED** |
| **Concurrency & ACID Ledger** | `tests/concurrency.test.js` | ✅ **3/3 PASSED** |
| **Failure & Resilience** | `tests/failure.test.js` | ✅ **5/5 PASSED** |
| **End-to-End Integration** | `tests/integration.test.js` | ✅ **5/5 PASSED** |
| **Dashboard AutoMod** | `tests/dashboard-automod.test.js` | ✅ **1/1 PASSED** |

### สิ่งที่ชุดทดสอบครอบคลุม

- ✅ **Verification** — Config CRUD, Embed/Button Builder, Captcha Generator, Role Grant, Unverified Role Removal, Jail Block, Duplicate Guard
- ✅ **ACID Economy** — Idempotency Key Replay, 100 Concurrent Transactions, Double-Entry Ledger
- ✅ **Failure Injection** — Redis Disconnection Fallback, HTTP 429 Backoff, Worker Crash → DLQ, Graceful Drain
- ✅ **Integration** — Security Scoring, SaaS Entitlements, Async Job Dispatching
- ✅ **Dashboard** — REST API AutoMod Filter CRUD

---

## 🚢 Production Deployment

### PM2 (แนะนำ)

```bash
# ติดตั้ง PM2
npm install -g pm2

# เริ่มบอท
pm2 start src/index.js --name "ultimate-bot" --interpreter node

# ดูสถานะและ Log
pm2 status
pm2 logs ultimate-bot

# Auto-start เมื่อ Reboot
pm2 save
pm2 startup
```

### 5-Phase Graceful Shutdown

เมื่อได้รับสัญญาณ `SIGINT` หรือ `SIGTERM` บอทจะเริ่มกระบวนการ **Graceful Shutdown** อัตโนมัติ:

```
Phase 1 → หยุดรับงานใหม่ & ตั้งสถานะ Invisible
Phase 2 → รอให้ Job Queue ว่างเปล่า (Grace Timeout 10s)
Phase 3 → ปิดการเชื่อมต่อ Discord WebSocket Gateway
Phase 4 → Flush Cache & ปิด Connection Pools (Redis + PostgreSQL)
Phase 5 → จบ Process อย่างปลอดภัย — ไม่ทิ้ง Transaction ค้าง
```

---

## 🗄️ Schema ฐานข้อมูลหลัก

ระบบใช้ PostgreSQL พร้อมตารางหลัก:

| ตาราง | คำอธิบาย |
|---|---|
| `guild_configs` | ตั้งค่าต่อ Guild (welcome, autorole, mod log, ...) |
| `economy` | ยอดเงินกระเป๋าและธนาคาร |
| `economy_transactions` | Audit Ledger ทุกธุรกรรมการเงิน |
| `warnings` | Warning Points สะสม |
| `cases` | บันทึก Moderation Case ทั้งหมด |
| `jail` | สมาชิกที่ถูก Jail อยู่ |
| `temp_bans` | แบนชั่วคราว (ปลดอัตโนมัติ) |
| `tickets` | Ticket ทั้งหมด |
| `automod_filters` | Filter AutoMod (Word, Regex, Domain) |
| `security_incidents` | Security Incident Timeline |
| `server_snapshots` | Snapshot โครงสร้างเซิร์ฟเวอร์ |
| `**verification_configs**` | ✦ **ใหม่** — ตั้งค่า Verification Panel |
| `**verification_logs**` | ✦ **ใหม่** — Audit Log การยืนยันตัวตน |
| `guild_subscriptions` | SaaS Plan & Feature Entitlements |
| `levels` | XP และ Level ของสมาชิก |
| `giveaways` | กิจกรรมแจกของรางวัล |

> ดู Schema ทั้งหมดได้ที่ [`src/database/all_migrations.sql`](src/database/all_migrations.sql)

---

## 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">

Built with ❤️ using **Discord.js v14** · **Node.js ESM** · **PostgreSQL** · **Redis**

</div>