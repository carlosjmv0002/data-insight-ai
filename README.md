# DataInsight AI — EDA Agent Inteligente para Arquivos CSV

**DataInsight AI** é uma aplicação web full-stack desenvolvida para atender ao **Desafio 4 — Interface Inteligente para Consulta de Arquivos CSV**. Ela combina **Data Profiling Automático (EDA)**, **Execução Analítica em DuckDB** e um **Agente Inteligente de IA Multi-Provedor (Google Gemini + Modelos Gratuitos da OpenRouter)** para permitir consultas e explorações profundas em linguagem natural sem necessidade de SQL.

---

## 1. Objetivo

Permitir que usuários sem conhecimento de programação ou SQL consigam:
1. Enviar arquivos compactados em `.ZIP` contendo um ou múltiplos CSVs e, opcionalmente, um dicionário de dados (`dicionario.csv`, `dictionary.csv`, `README.md`).
2. Obter imediatamente um perfilamento exploratório completo (EDA): contagem de registros, tipos semânticos (moeda, datas brasileiras, categorias, identificadores), valores ausentes, detecção estatística de outliers (critério IQR 1.5x), distribuições de frequência e séries temporais.
3. Fazer perguntas em linguagem natural pelo Chat do Agente selecionando o modelo de IA de sua preferência (**Google Gemini** ou **Modelos Gratuitos OpenRouter** como *Google Gemma 4*, *Cohere North Mini Code*, *NVIDIA Nemotron*, *OpenAI gpt-oss-20b*).
4. Ter os cálculos matemáticos e agregações calculados exclusivamente no **DuckDB** com precisão determinística e transparência (sem alucinações numéricas do LLM).
5. Visualizar respostas com tabelas interativas, gráficos do **Recharts** e o detalhamento técnico da consulta (*"Como a resposta foi obtida"*).

---

## 2. Arquitetura do Sistema

```mermaid
flowchart TD
    subgraph Client["🖥️ Interface Web (Frontend)"]
        U["👤 Usuário"] -->|"Upload ZIP (.csv + dicionário)"| UI["React 18 + Tailwind CSS"]
        UI -->|"Configura Chaves / Escolhe Modelo"| Modal["Modal de APIs & Seletor"]
        UI -->|"Chat em Linguagem Natural"| Chat["Painel de EDA & Chat Interativo"]
    end

    subgraph Server["⚙️ Servidor Node.js + Express"]
        API["Router API (/api/upload, /api/chat, /api/keys)"]
        ZIP["AdmZip Processor (Extração & Dicionário Semântico)"]
        
        subgraph Engine["🦆 Motor Analítico DuckDB (In-Memory)"]
            DDB["DuckDB Database Manager"]
            EDA["Profiling Automático (EDA / IQR Outliers / Séries)"]
            SQL["Execução Determinística de Consultas SQL"]
        end

        subgraph Agents["🤖 Camada Agêntica Multi-Provedor"]
            GA["Gemini EDA Agent (Google GenAI SDK)"]
            OA["OpenRouter EDA Agent (Modelos Gratuitos)"]
        end
    end

    subgraph External["☁️ Provedores de IA"]
        GEMINI["Google AI Studio (Gemini 3.7 Flash / 3.1 Pro)"]
        OR["OpenRouter (Gemma 4, Nemotron, GPT-OSS, Cohere)"]
    end

    UI -->|"HTTP Multipart (ZIP)"| API
    Chat -->|"POST /api/chat"| API
    API --> ZIP --> DDB
    DDB --> EDA --> UI
    
    API -->|"Roteamento de Consulta"| Agents
    GA <-->|"Function Calling / Grounding"| GEMINI
    OA <-->|"Tool Use / JSON Schemas"| OR
    
    Agents <-->|"execute_sql_query & generate_chart"| SQL
    SQL --> DDB
    Agents -->|"Resposta Estruturada (Texto + Tabelas + Recharts)"| UI
```

### Fluxo de Execução de Perguntas (Agente + DuckDB)

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuário
    participant UI as Interface React
    participant Server as Backend Express
    participant Agent as Agente IA (Gemini / OpenRouter)
    participant DuckDB as Motor DuckDB

    User->>UI: Pergunta: "Quais são os 5 maiores fornecedores em valor faturado?"
    UI->>Server: POST /api/chat { message, model }
    Server->>Agent: Prompt com Schema das Tabelas e Dicionário
    Agent->>Agent: Raciocina e decide chamar ferramenta `execute_sql_query`
    Agent->>DuckDB: SELECT NOME_FORNECEDOR, SUM(VLR_NF) FROM "notas" GROUP BY 1 ORDER BY 2 DESC LIMIT 5
    DuckDB-->>Agent: Retorna matriz de dados exata calculada em memória
    Agent->>Agent: Estrutura explicação + Configura gráfico (Recharts)
    Agent-->>Server: JSON estruturado com texto, dados tabulares e SQL executado
    Server-->>UI: Resposta completa e transparente
    UI-->>User: Exibe texto, ranking visual em tabela, gráfico de barras e detalhes técnicos
```


---

## 3. Modelos de IA Disponíveis

O sistema suporta seleção dinâmica do modelo de inferência no chat:

* **Google AI Studio:**
  * `gemini-3.7-flash` (Raciocínio rápido e analítico)
  * `gemini-3.1-pro-preview` (Alta capacidade de raciocínio lógico)
  * `gemini-3.1-flash-lite` (Latência ultrabaixa)
* **OpenRouter (Modelos 100% Gratuitos):**
  * `google/gemma-4-31b-it:free` (Multimodal com raciocínio e function calling)
  * `google/gemma-4-26b-a4b-it:free` (Mixture-of-Experts ultrarrápido)
  * `openai/gpt-oss-20b:free` (MoE com suporte a tool use e JSON schemas)
  * `cohere/north-mini-code:free` (Otimizado para código SQL e tarefas agênticas)
  * `nvidia/nemotron-3-super-120b-a12b:free` (Raciocínio analítico avançado)
  * `nvidia/nemotron-3-ultra-550b-a55b:free` (Janela de contexto de 1M tokens)
  * `nvidia/nemotron-3-nano-30b-a3b:free` (Consultas rápidas e leves)
  * `openrouter/free` (Auto-router inteligente)

---

## 4. Configuração de Chaves de API e Limites

Você pode configurar as chaves de API de **duas maneiras**:
1. **Pela Interface Web:** Clicando no botão **"Configurar Chaves de API"** na tela inicial ou no cabeçalho do painel.
2. **Pelo arquivo `.env`:** Criando um arquivo `.env` na raiz do projeto com base no `.env.example`.

### Arquivo `.env.example`:
```env
# Google Gemini AI Config (Opcional se usar OpenRouter)
GEMINI_API_KEY=sua_chave_gemini_aqui
GEMINI_MODEL=gemini-3.7-flash

# OpenRouter AI Config (Suporte a Modelos Gratuitos e Comerciais)
OPENROUTER_API_KEY=sua_chave_openrouter_aqui
OPENROUTER_MODEL=google/gemma-4-31b-it:free

# Limite de Upload em Megabytes (Padrão 25MB para Cloud Run/Proxy, pode ser aumentado para 500MB ou mais localmente)
MAX_UPLOAD_SIZE_MB=25
```

---

## 5. Como Executar Localmente

### Pré-requisitos:
* Node.js 18+ instalado.

### 1. Instalar Dependências:
```bash
npm install
```

### 2. Configurar o Ambiente:
```bash
cp .env.example .env
# Adicione sua OPENROUTER_API_KEY ou GEMINI_API_KEY no arquivo .env
# Caso deseje analisar arquivos maiores que 25MB, altere MAX_UPLOAD_SIZE_MB=500
```

### 3. Rodar em Modo de Desenvolvimento:
```bash
npm run dev
```
A aplicação estará disponível em `http://localhost:3000`.

### 4. Compilar para Produção:
```bash
npm run build
npm start
```

---

## 6. Arquivos Maiores que 25MB (Ambiente Local vs Nuvem)

* **Em Nuvem (AI Studio / Cloud Run Preview):** O proxy de entrada possui limite de 25MB (HTTP 413).
* **Em Ambiente Local:** Não há limitação de proxy! Basta configurar `MAX_UPLOAD_SIZE_MB=500` (ou o valor desejado) no `.env`. O DuckDB fará o processamento vetorizado diretamente na sua CPU e memória RAM local.

---

## 7. Exemplos de Perguntas para o Agente

* *"Qual fornecedor teve o maior valor faturado?"*
* *"Quais são os 5 maiores fornecedores?"*
* *"Qual foi o total gasto por mês?"*
* *"Existem valores atípicos ou outliers nos dados?"*
* *"Quais colunas possuem dados faltantes ou nulos?"*
* *"Faça uma análise exploratória completa dos dados."*
* *"Mostre um gráfico dos 10 maiores fornecedores."*
* *"Compare os fornecedores por valor total."*
