# PicSpeak

PicSpeak 鏄竴涓潰鍚戠湡瀹炰氦浠樺満鏅殑 AI 鎽勫奖鐐硅瘎椤圭洰锛屽寘鍚細

- 鍚庣鏈嶅姟锛欶astAPI + PostgreSQL + S3 鍏煎瀵硅薄瀛樺偍
- 鍓嶇搴旂敤锛歂ext.js 14
- 涓氬姟闂幆锛氭父瀹?鐧诲綍閴存潈銆佸浘鐗囩洿浼犮€佺収鐗囧叆搴撱€丄I 鐐硅瘎銆佷换鍔¤疆璇€佸巻鍙叉煡璇€侀搴︽帶鍒?
褰撳墠浠ｇ爜搴撳凡缁忓叿澶囦粠鏈湴寮€鍙戝埌娴嬭瘯鐜涓婄嚎鐨勫熀纭€鑳藉姏锛岄€傚悎浣滀负鎽勫奖鐐硅瘎绫讳骇鍝佺殑 MVP 鎴栧唴閮ㄧ増鏈€?
## 1. 鍔熻兘姒傝

- 鏀寔娓稿妯″紡锛屾棤闇€鍏堟敞鍐屽嵆鍙紑濮嬭瘎鍥?- 鏀寔 Google 鐧诲綍锛岀櫥褰曞悗榛樿鍗囩骇涓?`free` 鐢ㄦ埛
- 鏀寔瀵硅薄瀛樺偍棰勭鍚嶄笂浼狅紝鍓嶇鐩翠紶鍥剧墖锛屼笉缁忚繃鍚庣杞彂鏂囦欢
- 鏀寔鐓х墖纭鍏ュ簱鍜岀敤鎴疯祫婧愰殧绂?- 鏀寔 AI 鐐硅瘎鍚屾 / 寮傛涓ょ璋冪敤鏂瑰紡
- 鏀寔鐐硅瘎鍘嗗彶銆佸崟鍥剧偣璇勮褰曘€佷娇鐢ㄩ搴︽煡璇?- 鏀寔骞傜瓑閿€侀槻閲嶅鎻愪氦
- 鏀寔姣忔棩棰濆害鎺у埗銆佸熀纭€闄愭祦銆丄PI 瀹¤鏃ュ織
- 鏀寔鍙€夊浘鐗囧鏍稿紑鍏?- 鏀寔 WebSocket 浠诲姟鐘舵€佹帹閫?- 鏀寔缁熶竴閿欒鐮佸搷搴旀ā鍨嬪拰璇锋眰杩借釜 ID
- 鏀寔鐙珛 worker 杩涚▼閮ㄧ讲
- 鏀寔浠诲姟閲嶈瘯銆佹淇￠槦鍒楀拰浠诲姟浜嬩欢缂栨帓鏃ュ織

## 2. 鎶€鏈爤

### 鍚庣

- Python 3.10+
- FastAPI
- SQLAlchemy 2.x
- PostgreSQL
- boto3锛圫3 鍏煎瀵硅薄瀛樺偍锛?- 杩涚▼鍐呭紓姝ョ偣璇?Worker

### 鍓嶇

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS

## 3. 目录结构

```text
backend/
  app/
    api/
    core/
    db/
    services/
  requirements.txt
  .env.example

frontend/
  src/app/
  src/components/
  src/lib/

create_schema.sql
migration_*.sql
后端接口文档_v1.md
系统架构.md
```

## 4. 褰撳墠涓氬姟娴佺▼

1. 瀹㈡埛绔幏鍙栨父瀹护鐗岋紝鎴栭€氳繃 Google 鐧诲綍鎹㈠彇璁块棶浠ょ墝
2. 瀹㈡埛绔皟鐢?`/api/v1/uploads/presign` 鑾峰彇瀵硅薄瀛樺偍涓婁紶鍦板潃
3. 瀹㈡埛绔洿鎺ヤ笂浼犲浘鐗囧埌瀵硅薄瀛樺偍
4. 瀹㈡埛绔皟鐢?`/api/v1/photos` 纭涓婁紶骞剁敓鎴愮収鐗囪褰?5. 瀹㈡埛绔皟鐢?`/api/v1/reviews` 鍙戣捣 AI 鐐硅瘎
6. 寮傛妯″紡涓嬭疆璇?`/api/v1/tasks/{task_id}` 鑾峰彇浠诲姟杩涘害
7. 瀹㈡埛绔彲閫氳繃 `/api/v1/ws/tasks/{task_id}` 璁㈤槄浠诲姟鐘舵€佹帹閫?8. 瀹屾垚鍚庨€氳繃 `/api/v1/reviews/{review_id}` 鎴栧巻鍙叉帴鍙ｈ鍙栫粨鏋?
## 5. 宸插疄鐜版帴鍙?
- `POST /api/v1/auth/guest`
- `POST /api/v1/auth/google/login`
- `GET /api/v1/auth/google/callback`
- `POST /api/v1/uploads/presign`
- `POST /api/v1/photos`
- `POST /api/v1/reviews`
- `GET /api/v1/tasks/{task_id}`
- `GET /api/v1/ws/tasks/{task_id}`锛圵ebSocket锛?- `GET /api/v1/reviews/{review_id}`
- `GET /api/v1/me/reviews`
- `GET /api/v1/photos/{photo_id}/reviews`
- `GET /api/v1/me/usage`
- `GET /healthz`

璇︾粏鍗忚瑙?[鍚庣鎺ュ彛鏂囨。_v1.md](/e:/Project%20Code/PicSpeak/鍚庣鎺ュ彛鏂囨。_v1.md)銆?
## 6. 鐜瑕佹眰

### 鍩虹渚濊禆

- Python 3.10 鎴栨洿楂樼増鏈?- Node.js 18 鎴栨洿楂樼増鏈?- PostgreSQL 14+
- S3 鍏煎瀵硅薄瀛樺偍

### 绗笁鏂规湇鍔?
- SiliconFlow API Key
- Google OAuth Client锛堝鏋滃惎鐢?Google 鐧诲綍锛?
## 7. 鍚庣鐜鍙橀噺

鍚庣浼樺厛鍔犺浇 `backend/.env`锛屽悓鏃跺吋瀹逛粨搴撴牴鐩綍 `.env`銆傚缓璁互 `backend/.env.example` 涓烘ā鏉裤€?
### 蹇呭～椤?
- `DATABASE_URL`锛歅ostgreSQL 杩炴帴涓?- `OBJECT_BUCKET`锛氬璞″瓨鍌ㄦ《鍚?- `OBJECT_BASE_URL`锛氬浘鐗囧澶栬闂熀纭€鍦板潃
- `OBJECT_S3_ENDPOINT`锛歋3 鍏煎绔偣
- `OBJECT_ACCESS_KEY_ID`
- `OBJECT_SECRET_ACCESS_KEY`
- `SILICONFLOW_API_KEY`

### 閲嶈閰嶇疆椤?
- `APP_ENV`锛歚dev` / `test` / `prod`
- `APP_SECRET`锛氬簲鐢ㄧ鍚嶅瘑閽?- `MAX_UPLOAD_BYTES`锛氫笂浼犲ぇ灏忛檺鍒讹紝榛樿 20MB
- `DEFAULT_DAILY_QUOTA`锛歚free` 鐢ㄦ埛姣忔棩棰濆害鍩虹嚎
- `RATE_LIMIT_PER_MINUTE`锛氱敤鎴风淮搴﹀熀绾块檺娴?- `IP_RATE_LIMIT_PER_MINUTE`锛欼P 缁村害闄愭祦
- `GUEST_BURST_LIMIT_PER_10S`锛氭父瀹㈢煭鏃堕棿绐佸彂闄愬埗
- `OAUTH_JWT_SECRET`锛欽WT 绛惧悕瀵嗛挜锛岄潪 `dev` 鐜蹇呴』璁剧疆涓洪潪榛樿鍊?- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `FRONTEND_ORIGIN`锛欸oogle 鐧诲綍瀹屾垚鍚庣殑鍓嶇璺宠浆鍦板潃鏉ユ簮
- `BACKEND_CORS_ORIGINS`锛氬厑璁歌法鍩熺殑鍓嶇鏉ユ簮锛孞SON 鏁扮粍瀛楃涓?- `IMAGE_AUDIT_ENABLED`锛氭槸鍚﹀紑鍚浘鐗囧鏍?- `AI_MODEL_NAME` / `FLASH_MODEL_NAME` / `PRO_MODEL_NAME`锛氱偣璇勬ā鍨嬮厤缃?- `RUN_EMBEDDED_WORKER`锛氭槸鍚︾敱 API 杩涚▼鍐呭惎鍔?worker
- `REVIEW_WORKER_NAME`锛歸orker 瀹炰緥鍚?- `REVIEW_RETRY_BASE_DELAY_SECONDS`锛氶噸璇曞熀纭€閫€閬挎椂闂?- `REVIEW_RETRY_MAX_DELAY_SECONDS`锛氶噸璇曟渶澶ч€€閬挎椂闂?- `WS_TASK_POLL_INTERVAL_MS`锛歐ebSocket 鎺ㄩ€佹椂鏈嶅姟绔疆璇㈡暟鎹簱闂撮殧

### 鐢ㄦ埛绛夌骇涓庨搴﹁鍒?
- `guest`锛氶搴︿负 `DEFAULT_DAILY_QUOTA` 鐨勪竴鍗婏紝鑷冲皯 1 娆?- `free`锛氶搴︾瓑浜?`DEFAULT_DAILY_QUOTA`
- `pro`锛氶搴︿负 `DEFAULT_DAILY_QUOTA` 鐨?2 鍊?
## 8. 鍓嶇鐜鍙橀噺

寤鸿鍦?`frontend/.env.local` 涓厤缃細

- `NEXT_PUBLIC_API_URL`锛氬悗绔湇鍔″湴鍧€锛屼緥濡?`http://localhost:8000`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`

鍏朵腑 `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`銆乣GOOGLE_OAUTH_REDIRECT_URI`銆丟oogle Console 涓殑鍥炶皟鍦板潃蹇呴』淇濇寔涓€鑷淬€?
## 9. 鏈湴鍚姩

### 9.1 鍒濆鍖栨暟鎹簱

```bash
psql "$DATABASE_URL" -f create_schema.sql
psql "$DATABASE_URL" -f migration_20260305_daily_quota.sql
psql "$DATABASE_URL" -f migration_20260306_review_final_score.sql
```

### 9.2 鍚姩鍚庣

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

鍚庣鍋ュ悍妫€鏌ュ湴鍧€锛?
```text
GET http://localhost:8000/healthz
```

### 9.3 鍚姩鍓嶇

```bash
cd frontend
npm install
npm run dev
```

鏈湴榛樿璁块棶锛?
- 鍓嶇锛歚http://localhost:3000`
- 鍚庣锛歚http://localhost:8000`

## 10. 鐢熶骇閮ㄧ讲寤鸿

### 鍚庣

- 浣跨敤 `uvicorn` 澶氳繘绋嬫垨 `gunicorn + uvicorn workers` 閮ㄧ讲
- 閫氳繃 Nginx / 缃戝叧鏆撮湶 HTTPS
- PostgreSQL 涓庡璞″瓨鍌ㄤ娇鐢ㄧ嫭绔嬬敓浜у疄渚?- 鐢熶骇鐜寤鸿鍏抽棴 `RUN_EMBEDDED_WORKER`锛屽苟鍗曠嫭鍚姩 worker 杩涚▼
- 鐢熶骇鐜鍔″繀鏇挎崲榛樿 `APP_SECRET` 涓?`OAUTH_JWT_SECRET`
- `BACKEND_CORS_ORIGINS` 浠呬繚鐣欐寮忕珯鐐瑰煙鍚?- 濡傛灉鏈嶅姟閮ㄧ讲鍦ㄥ弽鍚戜唬鐞嗗悗锛屽彧鏈夊湪鍙俊浠ｇ悊鐜涓嬫墠寮€鍚?`TRUST_X_FORWARDED_FOR=true`

绀轰緥锛?
```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

鐙珛 worker锛?
```bash
python -m backend.app.worker_main
```

### 鍓嶇

```bash
cd frontend
npm install
npm run build
npm run start
```

### 瀵硅薄瀛樺偍

闇€瑕佸厑璁稿墠绔潵婧愬瀛樺偍妗舵墽琛岋細

- `PUT`
- `GET`
- `HEAD`
- `OPTIONS`

鍚﹀垯鍓嶇鐩翠紶浼氬洜涓?CORS 澶辫触銆?
## 11. 涓婄嚎妫€鏌ユ竻鍗?
- 鏁版嵁搴撳凡鎵ц寤鸿〃鑴氭湰鍜岃縼绉昏剼鏈?- `backend/.env`锛堟垨鍏煎浣跨敤鐨勬牴鐩綍 `.env`锛変腑鐢熶骇閰嶇疆宸插～鍐欏畬鏁?- 瀵硅薄瀛樺偍妗跺凡鍒涘缓锛屼笖 CORS 宸叉纭斁琛?- `OBJECT_BASE_URL` 鍙鍓嶇鐩存帴璁块棶
- Google OAuth 鍥炶皟鍦板潃涓夊涓€鑷?- `SILICONFLOW_API_KEY` 宸茬敓鏁?- 鍓嶇 `NEXT_PUBLIC_API_URL` 宸叉寚鍚戞寮忓悗绔煙鍚?- 鍚庣 `BACKEND_CORS_ORIGINS` 宸查厤缃寮忓墠绔煙鍚?- `/healthz` 鍙甯歌繑鍥?`{"status":"ok"}`

## 12. 褰撳墠瀹炵幇杈圭晫

浠ヤ笅鑳藉姏鍦?README 涓槑纭爣娉紝渚夸簬涓婄嚎鏃惰瘎浼伴闄╋細

- 鏁版嵁搴撲换鍔￠槦鍒楀凡鏀寔閲嶈瘯鍜屾淇★紝浣嗗綋鍓嶄粛鍩轰簬 PostgreSQL锛屼笉鏄?Redis / MQ 涓棿浠?- `/api/v1/me/usage` 褰撳墠鍙繑鍥為厤棰濅俊鎭紝`rate_limit` 缁撴瀯浠嶄负绌哄璞?- 娓稿韬唤閫氳繃 Cookie `ps_guest_token` 缁存寔锛屼細鍙楀墠鍚庣鍩熷悕鍜?Cookie 绛栫暐褰卞搷

濡傛灉瑕佽繘鍏ユ寮忕敓浜э紝浼樺厛寤鸿琛ラ綈锛?
- 瀹屾暣鐩戞帶鍛婅
- 鑷姩鍖栭儴缃蹭笌鍥炴粴
- 鏇寸粏绮掑害鐨勬潈闄愪笌椋庢帶

## 13. 鐩稿叧鏂囨。

- [鍚庣鎺ュ彛鏂囨。_v1.md](/PicSpeak/鍚庣鎺ュ彛鏂囨。_v1.md)
- [绯荤粺鏋舵瀯.md](/PicSpeak/绯荤粺鏋舵瀯.md)
- [Google鐧诲綍鎺ュ叆鎸囧崡.md](/PicSpeak/Google鐧诲綍鎺ュ叆鎸囧崡.md)

