# Lunaria ↔ OpenClaw Integration

Connect your local **OpenClaw** server directly to your **Lunaria** financial data.

---

## ⚡ Quick 1-Minute Setup

### Step 1: Copy Skill to OpenClaw
Copy this folder into your OpenClaw skills directory:

```bash
# If using workspace skills:
mkdir -p ~/.openclaw/workspace/skills/lunaria
cp -r /home/kitsu_/Desktop/coding/lunaria/openclaw-skill/* ~/.openclaw/workspace/skills/lunaria/

# OR if using global skills:
mkdir -p ~/.openclaw/skills/lunaria
cp -r /home/kitsu_/Desktop/coding/lunaria/openclaw-skill/* ~/.openclaw/skills/lunaria/
```

### Step 2: Ensure Permissions
Make sure the CLI script is executable:
```bash
chmod +x ~/.openclaw/workspace/skills/lunaria/lunaria.sh
```

### Step 3: Verify Your Agent Key
Your Lunaria backend has a pre-configured key in `.env`:
```bash
LUNARIA_AGENT_API_KEY=lunaria_sec_53709a29af6c6dca6ef9050c4da79eb4
```
If you ever change this key in `.env`, export it in your OpenClaw environment or update `lunaria.sh`.

---

## 💬 What to Ask Your OpenClaw Agent

Now you can message OpenClaw via **Telegram**, **Discord**, **WhatsApp**, or your web UI:

* *"What's my net worth and cash balance right now?"*
* *"How much did I spend this week?"*
* *"Am I on track with my monthly budget?"*
* *"Give me my morning financial briefing."*
* *"What are my top expenses from the past 14 days?"*
* *"Categorize that $34.50 charge as Dining."*

---

## ⏰ Autonomous Morning Briefings (OpenClaw Cron)

You can set up a recurring cron task in OpenClaw (e.g. daily at 8:00 AM) to automatically send you a financial digest:

**Prompt to OpenClaw:**
> *"Every morning at 8:00 AM, run the Lunaria briefing command and send me a concise financial snapshot with my net worth, yesterday's spending, and budget status."*
