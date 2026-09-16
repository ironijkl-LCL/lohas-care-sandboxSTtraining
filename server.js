const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// 自動補全 /v1 與清洗手誤
function getDifyBase() {
    let base = (process.env.DIFY_API_BASE || 'https://api.dify.ai/v1').trim();
    base = base.replace(/\[.*?\]\((.*?)\)/g, '$1').replace(/[\[\]\(\)\s]/g, '').replace(/\/+$/, '');
    base = base.replace(/\/(files\/upload|workflows\/run|chat-messages)$/, '');
    if (!base.endsWith('/v1')) {
        base += '/v1';
    }
    return base;
}

function getDifyKey() {
    let key = (process.env.DIFY_API_KEY || '').trim();
    key = key.replace(/\[.*?\]\((.*?)\)/g, '$1').replace(/[\[\]\(\)\s]/g, '');
    if (key.startsWith('Bearer')) key = key.replace(/^Bearer\s*/, '');
    return key;
}

app.get('/', (req, res) => {
    res.send(`✅ Lohas Dify API Proxy 正常在線！<br>端點位址: ${getDifyBase()}<br>金鑰已載入: ${getDifyKey() ? '是' : '否'}`);
});

app.post('/api/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '未接收到相片檔案' });
        
        const DIFY_API_KEY = getDifyKey();
        const DIFY_API_BASE = getDifyBase();

        if (!DIFY_API_KEY) {
            return res.status(500).json({ error: 'Render 未設定 DIFY_API_KEY 環境變數' });
        }

        const user = req.body.user || 'web_user_' + Date.now();

        // 1. 上傳相片到 Dify 取得 file_id
        const fileBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/jpeg' });
        const uploadFormData = new FormData();
        uploadFormData.append('file', fileBlob, req.file.originalname || 'meal.jpg');
        uploadFormData.append('user', user);

        const uploadRes = await fetch(`${DIFY_API_BASE}/files/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIFY_API_KEY}` },
            body: uploadFormData
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            return res.status(uploadRes.status).json({ 
                error: `Dify 圖片上傳失敗 (${uploadRes.status}): ${errText || '請確認 API Key 與端點正確'}` 
            });
        }

        const uploadJson = await uploadRes.json();
        const uploadFileId = uploadJson.id;

        // 2. 執行分析（優先以 Workflow 執行，若為 Chatflow 則自動轉向）
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

        let runRes = await fetch(`${DIFY_API_BASE}/workflows/run`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIFY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(workflowPayload)
        });

        if (runRes.status === 404) {
            // 兼容 Chatflow / Agent 類型
            runRes = await fetch(`${DIFY_API_BASE}/chat-messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DIFY_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: {},
                    query: "請分析食物名稱與 IDDSI 質地等級（Level 0到7），以 JSON 回傳。",
                    response_mode: "blocking",
                    user: user,
                    files: [{ type: "image", transfer_method: "local_file", upload_file_id: uploadFileId }]
                })
            });
        }

        if (!runRes.ok) {
            const errText = await runRes.text();
            return res.status(runRes.status).json({ error: `Dify 分析失敗 (${runRes.status}): ${errText}` });
        }

        const runJson = await runRes.json();
        const outputs = runJson.data?.outputs || runJson.answer || runJson;
        res.json(outputs);

    } catch (err) {
        res.status(500).json({ error: '伺服器內部錯誤: ' + err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Lohas Dify API 伺服器啟動於端口 ${PORT}`);
});
