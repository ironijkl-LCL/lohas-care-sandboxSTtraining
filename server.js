const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 允許所有來源跨域請求（解決瀏覽器 CORS 限制）
app.use(cors());
app.use(express.json());

const DIFY_API_KEY = process.env.DIFY_API_KEY || '';
const DIFY_API_BASE = (process.env.DIFY_API_BASE || 'https://api.dify.ai/v1').replace(/\/$/, '');

// 測試健康檢查端點
app.get('/', (req, res) => {
    res.send('✅ Lohas Dify API Proxy 正在正常運作！');
});

// 接收前端相片並轉發至 Dify
app.post('/api/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '請提供食物相片' });
        }
        if (!DIFY_API_KEY) {
            return res.status(500).json({ error: 'Render 未設定 DIFY_API_KEY 環境變數' });
        }

        const user = req.body.user || 'web_user_' + Date.now();

        // 步驟 1：將相片上傳至 Dify 檔案伺服器
        const fileBlob = new Blob([req.file.buffer], { type: req.file.mimetype });
        const uploadFormData = new FormData();
        uploadFormData.append('file', fileBlob, req.file.originalname || 'meal.jpg');
        uploadFormData.append('user', user);

        const uploadRes = await fetch(`${DIFY_API_BASE}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIFY_API_KEY}`
            },
            body: uploadFormData
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            console.error('Dify 上傳失敗:', errText);
            return res.status(uploadRes.status).json({ error: `Dify 圖片上傳失敗: ${errText}` });
        }

        const uploadJson = await uploadRes.json();
        const uploadFileId = uploadJson.id;

        // 步驟 2：執行 Dify 質地分析工作流 (Workflow)
        const workflowPayload = {
            inputs: {
                user_id: user,
                meal_type: req.body.meal_type || '餐膳快檢',
                meal_photo: {
                    transfer_method: 'local_file',
                    upload_file_id: uploadFileId,
                    type: 'image'
                }
            },
            response_mode: 'blocking',
            user: user
        };

        const workflowRes = await fetch(`${DIFY_API_BASE}/workflows/run`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIFY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(workflowPayload)
        });

        if (!workflowRes.ok) {
            const errText = await workflowRes.text();
            console.error('Dify 分析失敗:', errText);
            return res.status(workflowRes.status).json({ error: `Dify 工作流執行失敗: ${errText}` });
        }

        const workflowJson = await workflowRes.json();
        const outputs = workflowJson.data?.outputs || {};

        // 直接將分析結果輸出回前端 App
        res.json(outputs);

    } catch (err) {
        console.error('伺服器發生異常:', err);
        res.status(500).json({ error: '伺服器內部錯誤: ' + err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Lohas Dify API 伺服器已在端口 ${PORT} 啟動`);
});
