// ============================================
// AboutMe 搜尋引擎 - Node.js 伺服器 (新手版)
// ============================================

const express = require('express');
const cors = require('cors');
const { Client } = require('@elastic/elasticsearch');
const path = require('path');

// 初始化 Express 應用
const app = express();
const PORT = process.env.PORT || 3000;

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // 提供靜態檔案

// ============================================
// Elasticsearch 連線設定
// ============================================
const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});
    
// 檢查 ES 連線狀態
async function checkESConnection() {
  try {
    const info = await client.info();
    console.log('✓ Elasticsearch 連線成功！');
    console.log(`版本: ${info.version.number}`);
    return true;
  } catch (error) {
    console.error('✗ Elasticsearch 連線失敗:', error.message);
    console.log('請確保 Elasticsearch 已在 http://localhost:9200 運行');
    return false;
  }
}

// ============================================
// API 端點 - 1. 初始化索引
// ============================================
app.post('/api/init-index', async (req, res) => {
  try {
    const indexName = 'aboutme';
    
    // 檢查索引是否存在
    const exists = await client.indices.exists({ index: indexName });
    
    if (exists) {
      console.log('✓ 索引已存在，刪除舊索引...');
      await client.indices.delete({ index: indexName });
    }

    // 建立新索引
    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          analysis: {
            analyzer: {
              zh_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
              }
            }
          }
        },
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'zh_analyzer' },
            content: { type: 'text', analyzer: 'zh_analyzer' },
            page: { type: 'keyword' },
            category: { type: 'keyword' },
          }
        }
      }
    });

    console.log('✓ 索引已建立:', indexName);
    res.json({ success: true, message: '索引初始化成功' });
  } catch (error) {
    console.error('索引初始化失敗:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// API 端點 - 2. 索引資料
// ============================================
app.post('/api/index-data', async (req, res) => {
  try {
    const { title, content, page, category } = req.body;

    const result = await client.index({
      index: 'aboutme',
      body: {
        title,
        content,
        page,
        category,
        timestamp: new Date().toISOString()
      }
    });

    res.json({ success: true, id: result._id });
  } catch (error) {
    console.error('索引資料失敗:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// API 端點 - 3. 搜尋
// ============================================
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';

    if (!query.trim()) {
      return res.json({ results: [] });
    }

    const results = await client.search({
      index: 'aboutme',
      body: {
        query: {
          multi_match: {
            query: query,
            fields: ['title^2', 'content', 'category'], // title 權重更高
            fuzziness: 'AUTO' // 模糊搜尋，容許拼寫錯誤
          }
        },
        size: 20 // 最多返回 20 筆結果
      }
    });

    // 提取結果
    const hits = results.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      ...hit._source
    }));

    res.json({ results: hits });
  } catch (error) {
    console.error('搜尋失敗:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// API 端點 - 4. 取得統計資訊
// ============================================
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await client.indices.stats({ index: 'aboutme' });
    const count = await client.count({ index: 'aboutme' });

    res.json({
      totalDocs: count.count,
      indexStats: stats
    });
  } catch (error) {
    console.error('統計失敗:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 啟動伺服器
// ============================================
async function startServer() {
  // 檢查 ES 連線
  const connected = await checkESConnection();

  if (!connected) {
    console.warn('⚠ 警告：Elasticsearch 未連線，部分功能不可用');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 伺服器運行在: http://localhost:${PORT}`);
    console.log('\n可用的 API 端點:');
    console.log('  POST /api/init-index       - 初始化索引');
    console.log('  POST /api/index-data       - 索引單筆資料');
    console.log('  GET  /api/search?q=...     - 搜尋');
    console.log('  GET  /api/stats            - 統計資訊\n');
  });
}

startServer();
