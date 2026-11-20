# Put the Arodan server online for free (Oracle Cloud)

This puts the database and API on an Oracle Cloud **Always Free** server with HTTPS, a daily backup, and no monthly bill. It takes about an hour the first time. Copy each command exactly.

**What you get for free:** an Arm server with 2 processor cores, 12 GB of memory and up to 200 GB of storage. That's plenty for the pilot. (Oracle's limits as of November 2026; Oracle has changed them before.)

---

## 1. Create the account (10 min)

1. Go to https://www.oracle.com/cloud/free/ and click **Start for free**.
2. Fill in your details. A bank card is needed to confirm who you are. Oracle does not charge it for Always Free resources.
3. **Home region:** pick **UK South (London)**. It is usually the fastest from Lagos, and you **cannot change it later**.
4. Wait for the "account ready" email, then sign in at https://cloud.oracle.com.

> **Stop Oracle reclaiming the server:** Oracle may take back Always Free servers it considers idle, and a small pilot can look idle. Under **Billing > Upgrade and Manage Payment**, upgrading to **Pay As You Go** is widely reported to stop this while Always Free resources stay free. If you do it, also set a **budget alert** (Billing > Budgets) at ₦1,000 so you're warned if anything ever costs money.

## 2. Create the server (10 min)

1. Menu (☰) > **Compute > Instances > Create instance**.
2. **Name:** `arodan-api`.
3. **Image and shape** > **Edit**:
   - Image: **Change image > Ubuntu > Canonical Ubuntu 24.04**.
   - Shape: **Change shape > Ampere > VM.Standard.A1.Flex**, set **2 OCPUs** and **12 GB** memory. It must say *Always Free-eligible*.
4. **Networking:** keep "Create new virtual cloud network" and "Create new public subnet". Make sure **Assign a public IPv4 address** is on.
5. **Add SSH keys:** choose **Generate a key pair for me** and click **Download private key**. Keep this file safe; it's the only way into the server.
6. Click **Create**. After a minute the status turns **Running**. Copy the **Public IP address** (e.g. `203.0.113.7`).

> **"Out of capacity" error?** Free Arm servers are sometimes all taken. Try another *Availability domain* in step 4, or try again in a few hours.

## 3. Open the web ports (3 min)

1. On the instance page, click the **Subnet** link, then the **Default Security List**.
2. **Add Ingress Rules**: Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range `80,443`. Save.

## 4. Connect to the server (5 min)

**Windows:** open **PowerShell**. **Mac:** open **Terminal**. Then (use your key file's path and your IP):

```
ssh -i "C:\Users\you\Downloads\ssh-key-2026-11-20.key" ubuntu@203.0.113.7
```

On a Mac, first run `chmod 600 ~/Downloads/ssh-key-*.key`. Type `yes` if asked. You're in when the prompt shows `ubuntu@arodan-api`.

## 5. Install Docker and open the firewall (5 min)

Paste these one at a time:

```
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
exit
```

Then connect again with the same `ssh` command as step 4.

## 6. Download Arodan and fill in the settings (10 min)

> The server code must be merged into `main` on GitHub first (pull request #2). Until then, add `-b backend-own-server` after `git clone`.

```
git clone https://github.com/thetowngrowershub-max/arodan-app.git
cd arodan-app
cp server/.env.example .env
openssl rand -hex 24
openssl rand -hex 24
```

The last two commands print two random strings. Now open the settings file:

```
nano .env
```

Change these lines (arrow keys to move):

| Setting | What to put |
| --- | --- |
| `POSTGRES_PASSWORD` | the first random string |
| `JWT_SECRET` | the second random string |
| `DOMAIN` | your domain, or the free one made from your IP: `api.203-0-113-7.sslip.io` (your IP with dashes) |
| `TEST_OTP_PHONES` | your testers' numbers and fixed codes, e.g. `2348031234567:123456` |
| `SMS_PROVIDER` and its keys | leave as is until you have an SMS account (see step 9) |

Save with **Ctrl+O**, **Enter**, then exit with **Ctrl+X**.

## 7. Start everything (5 min)

```
docker compose --profile https up -d --build

```

The first start takes a few minutes. Then check it works (use your DOMAIN):

```
curl https://api.203-0-113-7.sslip.io/health
```

You should see `{"ok":true}`. You can also open that address in your phone's browser.

## 8. Point the app at your server

In `customer-app/.env` on your computer:

```
EXPO_PUBLIC_API_URL=https://api.203-0-113-7.sslip.io
```

Restart `npx expo start`. Sign in with a number from `TEST_OTP_PHONES` and its code.

## 9. Turn on real SMS (when ready)

**Message Central** (cheapest found, about $0.0078 per code; can also send by WhatsApp):
1. Create an account at https://www.messagecentral.com and add credit.
2. Copy your **Customer ID** and use your account **password**.
3. In `.env` on the server: `SMS_PROVIDER=messagecentral`, `MESSAGECENTRAL_CUSTOMER_ID=…`, `MESSAGECENTRAL_PASSWORD=…`. Use `MESSAGECENTRAL_FLOW=WHATSAPP` to send codes on WhatsApp instead of SMS.

**Termii:** `SMS_PROVIDER=termii` and `TERMII_API_KEY=…` with a registered sender ID.

Then restart: `docker compose --profile https up -d`.

## 10. Daily backups (2 min)

```
crontab -e
```

Choose `nano` if asked, add this line at the bottom, then save (Ctrl+O, Enter, Ctrl+X):

```
0 3 * * * cd ~/arodan-app && ./scripts/backup.sh >> ~/backups/backup.log 2>&1
```

Backups go to `~/backups` on the server (last 14 days kept). To also keep copies off the server, download them now and then with `scp -i <key> ubuntu@<ip>:~/backups/* .`

## Everyday tasks

| Task | Command (on the server, inside `~/arodan-app`) |
| --- | --- |
| Install a new version | `git pull && docker compose --profile https up -d --build` |
| See what the server is doing | `docker compose logs -f api` (Ctrl+C to stop) |
| See sign-in codes when no SMS provider is set | `docker compose logs api \| grep "SMS not sent"` |
| Restart | `docker compose --profile https restart` |
| Open the database | `docker compose exec db psql -U arodan arodan` |

## When it's time to pay

Moving to a paid host later only means running the same steps on the new server and restoring the latest backup:
`gunzip -c arodan-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U arodan arodan` (on the new server, right after the first start).
