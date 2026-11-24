const crypto = require('crypto');
const express = require('express');
const app = express();
app.use(express.json());

// Suas credenciais da Shopee (quando chegarem, substitua aqui ou use variáveis de ambiente)
const APP_ID = process.env.SHOPEE_APP_ID || 'SEU_APP_ID';
const SECRET_KEY = process.env.SHOPEE_SECRET_KEY || 'SUA_SECRET_KEY';
const HOST = 'https://open-api.affiliate.shopee.com.br';

// Função para gerar a assinatura SHA256 obrigatória
function generateShopeeSignature(appId, secretKey, timestamp, payloadString) {
  const baseString = `${appId}${timestamp}${payloadString}`;
  return crypto
    .createHmac('sha256', secretKey)
    .update(baseString)
    .digest('hex');
}

// Função genérica para chamar a Open API da Shopee via GraphQL
async function callShopeeAPI(query, variables = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ query, variables });
  const signature = generateShopeeSignature(APP_ID, SECRET_KEY, timestamp, payload);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
  };

  try {
    const response = await fetch(`${HOST}/graphql`, {
      method: 'POST',
      headers,
      body: payload
    });
    return await response.json();
  } catch (error) {
    console.error('Erro na requisição da Shopee:', error);
    throw error;
  }
}

// 1. Rota para buscar produtos em alta / comissão extra
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

// 2. Rota principal do seu app que dispara a automação inteira
app.post('/api/gerar-campanha', async (req, res) => {
  try {
    console.log('Buscando ofertas na Shopee...');
    const products = await fetchTopProducts();

    if (!products.length) {
      return res.status(400).json({ error: 'Nenhum produto retornado pela API da Shopee.' });
    }

    // Pega o primeiro produto em destaque para o teste do ciclo
    const produto = products[0];

    // Aqui o robô prepara os dados para o próximo passo (Gerar Vídeo + Legenda)
    const campanha = {
      produto: produto.productName,
      preco: produto.price,
      comissao: produto.commissionRate,
      imagemUrl: produto.imageUrl,
      linkOriginal: produto.offerLink,
      status: 'Oferta capturada com sucesso! Pronto para gerar vídeo e postar.'
    };

    // Responde com o pacote pronto
    res.json({ success: true, campanha });

  } catch (error) {
    res.status(500).json({ success: false, erro: error.message });
  }
});

// Inicializa o servidor na porta configurada pela nuvem
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Aplicativo rodando na porta ${PORT}`);
});
