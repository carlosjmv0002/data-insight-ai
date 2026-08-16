import AdmZip from 'adm-zip';

export function generateBrazilianSampleZip(sampleType: string = 'notas_fiscais'): Buffer {
  const zip = new AdmZip();

  // 1. Data Dictionary CSV
  const dicionarioCsv = `COLUNA,DESCRICAO,TIPO,UNIDADE,REGRAS_NEGOCIO
NUM_NF,Número da Nota Fiscal,VARCHAR,-,Identificador sequencial da NF
DT_EMISSAO,Data de emissão da nota fiscal,DATE,-,Formato DD/MM/YYYY
COD_FORN,Código de identificação do fornecedor,VARCHAR,-,Chave estrangeira de fornecedores
NOME_FORNECEDOR,Razão social do fornecedor,VARCHAR,-,Nome fantasia ou corporativo
UF_DESTINO,Estado de destino da mercadoria,VARCHAR,-,Sigla da unidade federativa brasileira
VLR_NF,Valor total da nota fiscal,DOUBLE,R$,Valor financeiro total em Reais
QTD_ITENS,Quantidade de itens faturados,INTEGER,unidades,Volume total de produtos
VLR_DESCONTO,Valor do desconto concedido,DOUBLE,R$,Desconto aplicado na operação
STATUS_PAGTO,Status de liquidação financeira,VARCHAR,-,Pago, Pendente ou Cancelado
COD_PROD,Código do produto principal,VARCHAR,-,Identificador do SKU
CATEGORIA,Categoria de mercado do produto,VARCHAR,-,Classificação mercadológica
`;
  zip.addFile('dicionario.csv', Buffer.from(dicionarioCsv, 'utf-8'));

  // 2. Notas Fiscais Dataset
  const fornecedores = [
    'TechSupply Distribuidora S/A',
    'LogisBrasil Transportes Ltda',
    'Sul Minas Alimentos',
    'MegaPack Embalagens Industriais',
    'Nexus Eletrônicos do Brasil',
    'BioQuímica Farmacêutica',
    'Paulista Manufatura e Comércio',
    'Amazonas Madeiras Sustentáveis',
    'Delta Equipamentos & Ferramentas',
    'Alfa Papelaria e Escritório',
  ];

  const categorias = [
    'Tecnologia',
    'Alimentos & Bebidas',
    'Embalagens',
    'Logística',
    'Equipamentos',
    'Material de Escritório',
    'Químicos',
  ];

  const ufs = ['SP', 'RJ', 'MG', 'PR', 'RS', 'SC', 'BA', 'PE', 'CE', 'GO'];
  const status = ['Pago', 'Pago', 'Pago', 'Pendente', 'Pendente', 'Cancelado'];

  let notasCsv = 'NUM_NF,DT_EMISSAO,COD_FORN,NOME_FORNECEDOR,UF_DESTINO,CATEGORIA,VLR_NF,QTD_ITENS,VLR_DESCONTO,STATUS_PAGTO\n';

  const startDate = new Date(2024, 0, 1);
  const totalRows = 450;

  for (let i = 1; i <= totalRows; i++) {
    const numNf = `NF-${10000 + i}`;
    
    // Distribute across 2024 months
    const dayOffset = Math.floor((i / totalRows) * 360) + Math.floor(Math.random() * 5);
    const d = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayStr = String(d.getDate()).padStart(2, '0');
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    const yearStr = d.getFullYear();
    const dtEmissao = `${dayStr}/${monthStr}/${yearStr}`;

    const fornIdx = Math.floor(Math.random() * fornecedores.length);
    // Weight some suppliers higher to create realistic skew
    const chosenForn = Math.random() < 0.35 ? fornecedores[0] : fornecedores[fornIdx];
    const codForn = `FORN-${String(fornecedores.indexOf(chosenForn) + 1).padStart(3, '0')}`;

    const uf = ufs[Math.floor(Math.random() * ufs.length)];
    const cat = categorias[Math.floor(Math.random() * categorias.length)];
    
    // Realistic base value with occasional outlier
    let baseValue = (Math.random() * 8000 + 450);
    if (i % 45 === 0) {
      baseValue = Math.random() * 50000 + 45000; // Outlier!
    }
    const vlrNf = Number(baseValue.toFixed(2));
    const qtdItens = Math.floor(Math.random() * 50) + 1;
    const vlrDesconto = Number((Math.random() < 0.4 ? vlrNf * (Math.random() * 0.1) : 0).toFixed(2));
    const statusPag = status[Math.floor(Math.random() * status.length)];

    notasCsv += `${numNf},${dtEmissao},${codForn},"${chosenForn}",${uf},"${cat}",${vlrNf},${qtdItens},${vlrDesconto},${statusPag}\n`;
  }
  zip.addFile('notas_fiscais_2024.csv', Buffer.from(notasCsv, 'utf-8'));

  // 3. Products Catalog Dataset
  let produtosCsv = 'COD_PROD,NOME_PRODUTO,CATEGORIA,PRECO_UNITARIO,ESTOQUE_ATUAL,STATUS_PRODUTO\n';
  const produtos = [
    { cod: 'PRD-001', nome: 'Servidor Rack 2U Dell PowerEdge', cat: 'Tecnologia', preco: 18500.0, est: 12 },
    { cod: 'PRD-002', nome: 'Notebook Corporativo ThinkPad 16GB', cat: 'Tecnologia', preco: 6200.0, est: 45 },
    { cod: 'PRD-003', nome: 'Caixa de Papelão Ondulado 50L (Fardo 100un)', cat: 'Embalagens', preco: 380.5, est: 250 },
    { cod: 'PRD-004', nome: 'Filme Stretch Automático 500mm', cat: 'Embalagens', preco: 125.0, est: 320 },
    { cod: 'PRD-005', nome: 'Café Especial Arábica Torrado 1kg', cat: 'Alimentos & Bebidas', preco: 64.9, est: 180 },
    { cod: 'PRD-006', nome: 'Água Mineral Galão 20L', cat: 'Alimentos & Bebidas', preco: 18.0, est: 95 },
    { cod: 'PRD-007', nome: 'Kit Ferramentas Industriais 120 Peças', cat: 'Equipamentos', preco: 2450.0, est: 28 },
    { cod: 'PRD-008', nome: 'Paleteira Hidráulica 2500kg', cat: 'Equipamentos', preco: 3100.0, est: 8 },
    { cod: 'PRD-009', nome: 'Papel Sulfite A4 75g (Caixa com 10 resmas)', cat: 'Material de Escritório', preco: 285.0, est: 140 },
    { cod: 'PRD-010', nome: 'Desengraxante Industrial Concentrado 20L', cat: 'Químicos', preco: 450.0, est: 50 },
  ];

  for (const p of produtos) {
    produtosCsv += `${p.cod},"${p.nome}","${p.cat}",${p.preco},${p.est},Ativo\n`;
  }
  zip.addFile('catalogo_produtos.csv', Buffer.from(produtosCsv, 'utf-8'));

  return zip.toBuffer();
}
