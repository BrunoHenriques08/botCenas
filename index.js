import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import 'dotenv/config';

// Configuração do Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // substitui pelo teu token
const CHAT_ID = process.env.CHAT_ID;         // substitui pelo teu chat ID

// Função para enviar mensagem via Telegram
async function enviarTelegram(mensagem) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: mensagem,
      parse_mode: "HTML"
    });
    console.log("✅ Mensagem enviada para Telegram");
  } catch (err) {
    console.error("❌ Erro ao enviar Telegram:", err.message);
  }
}

async function getCombustivelPrevisao() {
  try {
    const url = "https://precocombustiveis.pt/proxima-semana/";
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0", // simula navegador
      },
    });

    const $ = cheerio.load(data);

    // Buscar todo o texto dentro da div de conteúdo principal
    const previsao = $("header").text().trim();

    let regexAtualizacao = /Atualizado a (\d{1,2} de [A-Za-z]+ de \d{4})/;
    let dataAtualizacao = previsao.match(regexAtualizacao);
    dataAtualizacao = dataAtualizacao ? dataAtualizacao[1] : null;

    // Período da previsão
    let regexPeriodo = /preço dos combustíveis na próxima semana \((\d{1,2} a \d{1,2} de [A-Za-z]+)\)/i;
    let periodoPrevisao = previsao.match(regexPeriodo);
    periodoPrevisao = periodoPrevisao ? periodoPrevisao[1] : null;

    // Gasóleo
    let regexGaso = /O Gasóleo deverá (subir|descer) até ([\d,.]+) cêntimos.*?\(([\d,.]+) euros\/litro\)/i;
    let gasoleoMatch = previsao.match(regexGaso);
    let gasoleo = gasoleoMatch ? { direcao: gasoleoMatch[1], variacao_cents: gasoleoMatch[2], preco_eur: gasoleoMatch[3] } : null;

    // Gasolina
    let regexGas = /a Gasolina deverá (subir|descer) até ([\d,.]+) cêntimos.*?\(([\d,.]+) euros\/litro\)/i;
    let gasolinaMatch = previsao.match(regexGas);
    let gasolina = gasolinaMatch ? { direcao: gasolinaMatch[1], variacao_cents: gasolinaMatch[2], preco_eur: gasolinaMatch[3] } : null;

    // JSON final
    let previsaoFinal = {
    data_atualizacao: dataAtualizacao,
    periodo_previsao: periodoPrevisao,
    combustiveis: {
        gasoleo: gasoleo,
        gasolina: gasolina
    }
    };

    console.log(previsaoFinal);

        // Construir mensagem formatada para Telegram
    let mensagem = `<b>Previsão Combustíveis</b>\n\n` +
      `📅 Atualizado a: ${dataAtualizacao}\n` +
      `⏳ Período da previsão: ${periodoPrevisao}\n\n` +
      `⛽ Gasóleo: ${gasoleo ? gasoleo.direcao + " " + gasoleo.variacao_cents + " cêntimos" : "N/A"}\n` +
      `⛽ Gasolina: ${gasolina ? gasolina.direcao + " " + gasolina.variacao_cents + " cêntimos" : "N/A"}\n`

    // Lê os dados antigos (se existirem)
    let dadosAntigos = {};
    if (fs.existsSync("dados.json")) {
      const rawData = fs.readFileSync("dados.json", "utf-8");
      dadosAntigos = JSON.parse(rawData);
    }

    // Verifica se há atualização
    if (previsaoFinal.data_atualizacao === dadosAntigos.data_atualizacao) {
      console.log("Os dados estão atualizados. Não é necessário enviar mensagem.");
    } else {
      console.log("📢 Nova atualização encontrada, a enviar mensagem para o Telegram...");
      await enviarTelegram(mensagem);

      // Guardar no JSON
      fs.writeFileSync("dados.json", JSON.stringify(previsaoFinal, null, 2), "utf-8");
      console.log("💾 Dados guardados em dados.json");
    }


    
  } catch (err) {
    console.error("❌ Erro ao recolher dados:", err.message);
  }
}
// Configuração dos horários de execução
const HORARIO_METEOROLOGIA = { hora: 21, minuto: 0 };  // 21:00 todos os dias
const HORARIO_COMBUSTIVEL = { hora: 21, minuto: 0 };   // 21:00 apenas aos sábados

let ultimaExecucaoCombustivel = null;
let ultimaExecucaoMeteorologia = null;

// Função para verificar se deve executar meteorologia (todos os dias às 21:00)
function deveExecutarMeteorologia(ultimaExecucao) {
  const agora = new Date();
  const horaAtual = agora.getHours();
  const minutoAtual = agora.getMinutes();
  
  if (horaAtual === HORARIO_METEOROLOGIA.hora && minutoAtual === HORARIO_METEOROLOGIA.minuto) {
    const hoje = agora.toDateString(); // Data de hoje
    if (ultimaExecucao !== hoje) {
      return hoje;
    }
  }
  return null;
}

// Função para verificar se deve executar combustíveis (apenas sábados às 21:00)
function deveExecutarCombustivel(ultimaExecucao) {
  const agora = new Date();
  const horaAtual = agora.getHours();
  const minutoAtual = agora.getMinutes();
  const diaSemana = agora.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
  
  // Verifica se é sábado (6) e se é a hora correta
  if (diaSemana === 6 && horaAtual === HORARIO_COMBUSTIVEL.hora && minutoAtual === HORARIO_COMBUSTIVEL.minuto) {
    const hoje = agora.toDateString(); // Data de hoje
    if (ultimaExecucao !== hoje) {
      return hoje;
    }
  }
  return null;
}

// Loop principal
async function iniciarMonitoramento() {
  console.log("🚀 Iniciando monitoramento...");
  console.log("📋 Configuração:");
  console.log("   🌤️  Meteorologia: Todos os dias às 21:00");
  console.log("   ⛽ Combustíveis: Apenas aos sábados às 21:00");
  
  while (true) {
    try {
      const agora = new Date();
      const horaFormatada = agora.toLocaleTimeString('pt-PT');
      const diaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][agora.getDay()];
      
      // Verifica meteorologia (todos os dias às 21:00)
      const executarMeteorologia = deveExecutarMeteorologia(ultimaExecucaoMeteorologia);
      if (executarMeteorologia) {
        console.log(`🌤️ [${diaSemana} ${horaFormatada}] Executando previsão meteorológica...`);
        await previsaoTempoAmanha();
        ultimaExecucaoMeteorologia = executarMeteorologia;
      }
      
      // Verifica combustíveis (apenas sábados às 21:00)
      const executarCombustivel = deveExecutarCombustivel(ultimaExecucaoCombustivel);
      if (executarCombustivel) {
        console.log(`⛽ [${diaSemana} ${horaFormatada}] Executando verificação de combustíveis...`);
        await getCombustivelPrevisao();
        ultimaExecucaoCombustivel = executarCombustivel;
      }
      
      // Log de status a cada 10 minutos (apenas para debug, pode remover)
      if (agora.getMinutes() % 10 === 0 && agora.getSeconds() < 30) {
        console.log(`⏰ [${diaSemana} ${horaFormatada}] Monitoramento ativo...`);
      }
      
      // Aguarda 30 segundos antes da próxima verificação
      await new Promise(resolve => setTimeout(resolve, 30000));
      
    } catch (error) {
      console.error("❌ Erro no loop principal:", error.message);
      // Aguarda 1 minuto em caso de erro antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }
}

// Inicia o monitoramento
iniciarMonitoramento();

async function previsaoTempoAmanha() {
  try {

    const url = "https://api.ipma.pt/public-data/forecast/aggregate/1011900.json";

    const hoje = new Date();

    // Criar data de amanhã
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);


    const ano = amanha.getFullYear();
    const mes = String(amanha.getMonth() + 1).padStart(2, "0");
    const dia = String(amanha.getDate()).padStart(2, "0");

    const response = await axios.get(url);
    const data = response.data;

    const item = data.find(obj => 
      obj.dataPrev === `${ano}-${mes}-${dia}T00:00:00` && obj.tMin !== undefined
    );

    if (item) {
      console.log("Data Atualização:", item.dataUpdate);
      console.log("Data Previsão:", item.dataPrev);
      console.log("Probabilidade de Precipitação:", item.probabilidadePrecipita);
      console.log("Temperatura Mínima:", item.tMin);
      console.log("Temperatura Máxima:", item.tMax);

      let mensagem = `<b>Previsão Meteorologia</b>\n\n` +
      `📅 Atualizado a: ${item.dataUpdate.replace("T", " ")}\n` +
      `⏳ Previsão para: ${item.dataPrev.replace("T00:00:00", "")}\n\n` +
      `🌡️ Temp Mínima: ${item.tMin}\n` +
      `🌡️ Temp Máxima: ${item.tMax}\n` +
      `🌧️ Probabilidade de precipitação: ${item.probabilidadePrecipita}\n` +
      `🔆 Índice UV: ${item.iUv}\n`

      console.log(mensagem);
      await enviarTelegram(mensagem);
    }

  } catch (err) {
    // console.error("❌ Erro ao salvar JSON:", err.message);
    console.error(err.message);
  }
}
