
const crypto = require('crypto');
const express = require('express');
const app = express();
app.use(express.json());

// Credenciais (Configure nas Environment Variables do Render)
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || 'SEU_APP_ID';
const SHOPEE_SECRET_KEY = process.env.SHOPEE_SECRET_KEY || 'SUA_SECRET_KEY';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'SUA_CHAVE_GOOGLE_AI_STUDIO';
const SHOPEE_HOST = 'https://open-api.affiliate.shopee.com.br';

// ==========================================
// MÓDULO 1: SHOPEE OPEN API
// ==========================================
function generateShopeeSignature(appId, secretKey, timestamp, payloadString) {
  const baseString = `${appId}${timestamp}${payloadString}`;
  return crypto.createHmac('sha256', secretKey).update(baseString).digest('hex');
}

async function callShopeeAPI(query, variables = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ query, variables });
  const signature = generateShopeeSignature(SHOPEE_APP_ID, SHOPEE_SECRET_KEY, timestamp, payload);

  const response = await fetch(`${SHOPEE_HOST}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
    },
    body: payload
  });
  return await response.json();
}

async function fetchTopProducts() {
  const query = `
    query getProductOffer($limit: Int!) {
      productOfferV2(limit: $limit) {
        nodes {
          productName
          price
          commissionRate
          imageUrl
          offerLink
        }
      }
    }
  `;
  const result = await callShopeeAPI(query, { limit: 5 });
  return result.data?.productOfferV2?.nodes || [];
}

// ==========================================
// MÓDULO 2: GERAÇÃO DE VÍDEO (GOOGLE FLOW / VEO API)
// ==========================================

// Baixa a imagem da Shopee e converte para Base64
async function imageUrlToBase64(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

// Dispara a geração do vídeo 9:16 no modelo Veo
async function gerarVideoFlow(imageUrl, productName) {
  console.log('Baixando imagem do produto para animar...');
  const base64Image = await imageUrlToBase64(imageUrl);

  const promptVideo = `Commercial product showcase video of ${productName}. Smooth cinematic slow zoom and subtle camera pan, studio lighting, realistic textures, vibrant colors, clean aesthetic background, vertical 9:16 format, high conversion social media ad style.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${GEMINI_API_KEY}`;

  const body = {
    instances: [
      {
        prompt: promptVideo,
        image: {
          bytesBase64Encoded: base64Image,
          mimeType: "image/jpeg"
        }
      }
    ],
    parameters: {
      aspectRatio: "9:16",
      personGeneration: "dont_allow"
    }
  };

  console.log('Enviando para o motor de vídeo Google Veo/Flow...');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const operation = await response.json();
  if (!operation.name) {
    throw new Error(`Falha ao iniciar geração de vídeo: ${JSON.stringify(operation)}`);
  }

  // Aguarda a renderização ficar pronta (Polling)
  return await aguardarVideoPronto(operation.name);
}

// Verifica a cada 10 segundos se o vídeo terminou de renderizar
async function aguardarVideoPronto(operationName) {
  const statusUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GEMINI_API_KEY}`;

  while (true) {
    console.log('Renderizando vídeo... aguardando 10s...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    const res = await fetch(statusUrl);
    const statusData = await res.json();

    if (statusData.done) {
      if (statusData.error) {
        throw new Error(`Erro na renderização: ${statusData.error.message}`);
      }
      // Extrai a URI do vídeo gerado
      const videoUri = statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      // Adiciona a API Key na URL para permitir download direto do MP4
      return `${videoUri}&key=${GEMINI_API_KEY}`;
    }
  }
}

// ==========================================
// ROTA PRINCIPAL DA AUTOMAÇÃO
// ==========================================
app.post('/api/gerar-campanha', async (req, res) => {
  try {
    // 1. Busca oferta na Shopee
    const products = await fetchTopProducts();
    if (!products.length) {
      return res.status(400).json({ error: 'Nenhum produto encontrado na Shopee.' });
    }
    const produto = products[0];

    // 2. Gera o vídeo 9:16 automaticamente
    const videoUrl = await gerarVideoFlow(produto.imageUrl, produto.productName);

    res.json({
      success: true,
      produto: produto.productName,
      preco: produto.price,
      linkAfiliado: produto.offerLink,
      videoMp4Url: videoUrl,
      status: 'Vídeo 9:16 gerado com sucesso!'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, erro: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
