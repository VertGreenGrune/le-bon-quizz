# Installing Le Bon Quizz on your own server

This guide puts the whole app on one Linux server, with every quiz, picture and music file:
the app (web + API + game server), its PostgreSQL database and **Caddy**, which gives it a free
HTTPS certificate. Everything runs with Docker from `deploy/docker-compose.yml`.

At the end, players open `https://<your address>/join` on their phone, like on Kahoot.

> Tested end to end with Docker on an x86_64 machine (build, HTTPS, database migrations, import
> of the 6 quizzes, copy of a local database with its 73 pictures and sounds).

---

## 0. What you need

- **A Linux server** with Ubuntu 22.04 or 24.04, a public IP address, and **at least 2 GB of
  RAM** (or 1 GB plus the swap file of step 3). Games are small (15 players at most), so the
  smallest server is enough. Free option: **Oracle Cloud « Always Free »** (box below).
- **An address for the site.** Either your own domain name (e.g. `quiz.mondomaine.fr`), or, for
  free, the server's IP written with dashes followed by `.sslip.io`: for the IP `152.67.10.20`
  the address is **`152-67-10-20.sslip.io`** (nothing to sign up for, it already works).
- **Access to the GitHub repository** `VertGreenGrune/le-bon-quizz` (private): you will add a
  key in its settings in step 5.

> **Oracle Cloud « Always Free »** (free for good; a bank card is asked at sign-up but not
> charged):
>
> 1. Create an account on <https://www.oracle.com/cloud/free/>, choose a home region close to
>    you (e.g. Paris or Marseille).
> 2. **Compute → Instances → Create instance**: image **Ubuntu 24.04**, shape
>    **VM.Standard.A1.Flex** (Ampere) with 2 OCPU and 12 GB of memory, « Assign a public IPv4
>    address » checked, and **download the private SSH key** it offers (`ssh-key-….key`).
> 3. Note the **public IP address** of the instance.
> 4. **Open ports 80 and 443:** on the instance page, click the subnet → its **Security List** →
>    **Add Ingress Rules**: source `0.0.0.0/0`, protocol TCP, destination port `80`; then the
>    same with `443`.
>
> Step 2 below also opens them in the server's own firewall (Oracle's Ubuntu image blocks them).

## 1. Connect to the server

From your PC (PowerShell on Windows), with the key of your server:

```bash
ssh -i path/to/ssh-key.key ubuntu@<SERVER IP>
```

If Windows answers « UNPROTECTED PRIVATE KEY FILE », restrict the key to your user, then retry:

```powershell
icacls path\to\ssh-key.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

(The user is `ubuntu` on Oracle and most Ubuntu servers, `root` on some providers.) Every command
below runs **on the server**, unless it says « on your PC ».

## 2. Open the firewall

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get update && sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

(Those are for Oracle's image. On another provider using `ufw` instead:
`sudo ufw allow 80,443/tcp`.)

## 3. Add swap (only if the server has less than 2 GB of RAM)

Building the app needs memory:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

Then reconnect (step 1) so the `docker` group applies, and check:

```bash
docker run --rm hello-world
```

## 5. Download the project (with its quizzes, pictures and music)

The repository is private, so the server gets its own read-only key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/lebonquizz -N ""
cat ~/.ssh/lebonquizz.pub
```

Copy the line it prints, then on GitHub: repository **le-bon-quizz → Settings → Deploy keys →
Add deploy key**, paste it, title « serveur », **leave « Allow write access » unchecked**, save.
Back on the server:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/lebonquizz
  IdentitiesOnly yes
EOF
ssh-keyscan github.com >> ~/.ssh/known_hosts
git clone git@github.com:VertGreenGrune/le-bon-quizz.git
cd le-bon-quizz
ls content/quizzes
```

You should see the 6 quiz folders. Their pictures and music are in the repository, so they come
with it.

## 6. Configure

```bash
cd ~/le-bon-quizz/deploy
cp .env.example .env
openssl rand -hex 24
nano .env
```

In `.env`, set:

- `DOMAIN=` your address **without** `https://` (e.g. `152-67-10-20.sslip.io` or
  `quiz.mondomaine.fr`). With your own domain, first create a DNS **A record** for it pointing to
  the server's IP, and wait until `ping quiz.mondomaine.fr` answers with that IP.
- `POSTGRES_PASSWORD=` the long string printed by `openssl rand -hex 24`.

Save with `Ctrl+O`, `Entrée`, quit with `Ctrl+X`. (The e-mail lines can stay commented: see step 10.)

## 7. Start

```bash
cd ~/le-bon-quizz/deploy
docker compose up -d --build
```

The first time takes a few minutes (it builds the app). Then check:

```bash
docker compose ps
docker compose logs app | tail -5
curl https://$(grep ^DOMAIN= .env | cut -d= -f2)/health
```

`docker compose ps` shows `db`, `app` and `caddy` « Up »; the logs end with « Server listening at
… :8080 »; `curl` answers `{"status":"ok"}`. Open `https://<your address>` in a browser: the home
page of Le Bon Quizz, with a valid padlock.

## 8. Put your quizzes on it — choose A or B

### A. Fresh install from the repository (simplest)

1. In the browser, open `https://<your address>/register` and create your host account.
2. On the server, import the 6 quizzes into that account (replace the e-mail):

```bash
cd ~/le-bon-quizz/deploy
for q in batman blind-test-halloween halloween halloween-anime harry-potter tim-burton; do
  docker compose exec app node dist/import-quiz.js /content/$q votre@email.fr
done
```

Each line prints « Créé : « … » (n questions, privé) ». The quizzes are private, in your account,
with their pictures and music.

> This imports the quizzes **as they are in the repository**. Changes you made in the editor on
> your PC are only in your local database (for example your Harry Potter quiz has 24 questions
> locally and 23 in the repository): use **B** to get them, or have them copied back into the
> repository first.

### B. Exact copy of your PC (quizzes as in your editor, account, game reports)

Do this **instead of A**, right after step 7 (it replaces the server's database).

**On your PC** (PowerShell, in the project folder, with Docker Desktop running):

```powershell
docker exec lebonquizz-postgres-1 pg_dump -U lbq -d lbq -Fc -f /tmp/lbq.dump
docker cp lebonquizz-postgres-1:/tmp/lbq.dump .\lbq.dump
scp -i path\to\ssh-key.key .\lbq.dump ubuntu@<SERVER IP>:~/
scp -i path\to\ssh-key.key -r .\apps\server\uploads ubuntu@<SERVER IP>:~/uploads
```

**On the server:**

```bash
cd ~/le-bon-quizz/deploy
docker compose cp ~/lbq.dump db:/tmp/lbq.dump
docker compose exec db pg_restore -U lbq -d lbq --clean --if-exists --no-owner /tmp/lbq.dump
docker compose cp ~/uploads/. app:/data/uploads/
docker compose restart app
rm -r ~/lbq.dump ~/uploads
```

Log in at `https://<your address>/login` with **the same e-mail and password as on your PC**:
all your quizzes are there.

## 9. Play

- **TV:** open `https://<your address>`, log in, « Mes quiz » → ▶ Lancer.
- **Phones:** scan the QR code shown in the lobby, or open `https://<your address>/join` and type
  the PIN. Players don't need an account.
- The 📱 « Télécommande » and the full-screen button work there too (HTTPS is required for them,
  and Caddy provides it).

## 10. Optional: e-mails for « Mot de passe oublié »

Without them, a reset link is written to the logs (`docker compose logs app | grep reset`). To send
real e-mails, create a free SMTP account (e.g. Brevo, see `DEPLOY.md` §4b), then add to
`deploy/.env`:

```bash
SMTP_URL=smtps://<login>:<smtp key>@smtp-relay.brevo.com:465
MAIL_FROM=Le Bon Quizz <noreply@mondomaine.fr>
```

and apply: `docker compose up -d`.

---

## Every day

| What                                       | Command (in `~/le-bon-quizz/deploy`)                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| See if it runs                             | `docker compose ps`                                                                 |
| Logs                                       | `docker compose logs -f app` (Ctrl+C to quit)                                       |
| Restart                                    | `docker compose restart app`                                                        |
| Stop / start                               | `docker compose stop` / `docker compose up -d`                                      |
| **Update** after a `git push`              | `cd ~/le-bon-quizz && git pull && cd deploy && docker compose up -d --build`        |
| Re-import a quiz whose `quiz.json` changed | `docker compose exec app node dist/import-quiz.js /content/<folder> votre@email.fr` |

Database migrations run by themselves at every start. Re-importing a quiz **replaces** it with
its `quiz.json`: changes made in the editor on the server are lost for that quiz.

## Backups

The database and the uploaded files live in Docker volumes on the server. To save them:

```bash
cd ~/le-bon-quizz/deploy
mkdir -p ~/backups
docker compose exec -T db pg_dump -U lbq -d lbq -Fc > ~/backups/lbq-$(date +%F).dump
rm -rf ~/backups/uploads && docker compose cp app:/data/uploads ~/backups/uploads
```

Copy `~/backups` to your PC from time to time (`scp -r ubuntu@<SERVER IP>:~/backups .`). To restore
on a new server, follow 8B with these files.

Automatic daily database backup at 4 a.m. (`crontab -e`, then add this line):

```
0 4 * * * cd ~/le-bon-quizz/deploy && docker compose exec -T db pg_dump -U lbq -d lbq -Fc > ~/backups/lbq-$(date +\%F).dump
```

## If something goes wrong

| Symptom                                         | What to check                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The browser can't reach the site, or no padlock | Ports 80 / 443 open (Oracle Security List **and** step 2), `DOMAIN` points to this IP; `docker compose logs caddy` explains certificate errors |
| « Erreur interne » when logging in              | `docker compose ps`: is `db` up? `docker compose logs app`                                                                                     |
| The build stops with « Killed »                 | Not enough memory: do step 3 (swap) and run step 7 again                                                                                       |
| Pictures or sounds missing after 8B             | The `uploads` copy: run the `docker compose cp ~/uploads/. app:/data/uploads/` line again                                                      |
| Phones disconnect during a game                 | `docker compose logs app`; check the server isn't out of memory (`free -h`)                                                                    |
