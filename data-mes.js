// =======================================================
// ✅ EDITAR TODO MÊS AQUI (ou via Admin dentro do app)
// =======================================================

const APP_CONFIG = {
  ministerio: "MINISTÉRIO DE LOUVOR",
  subtitulo: "SUPORTE MUSICAL",
  mesNome: "JANEIRO",
  ano: 2026,

  // Chave do mês (muda aqui e o app passa a usar outro "banco" no localStorage)
  // Ex.: "2026-02"
  monthKey: "2026-01",

  // Endpoint de dados remotos (Netlify Function). Esse é o que permite
  // "Publicar para todos" sem precisar deploy.
  remoteApi: "/api/data",

  // ✅ Quem pode editar no FRONT-END (apenas para liberar a UI de Admin).
  // Recomendação: mantenha só o seu e-mail aqui e controle editores pelo role "editor".
  adminEmails: ["fabio.tec.audio@hotmail.com"]
};

// Lista central de funções (usada em Membros + Escalas)
const FUNCOES = [
  { key: "Bateria", icon: "🥁" },
  { key: "Baixo", icon: "🎸" },
  { key: "Guitarra", icon: "🎸" },
  { key: "Violão", icon: "🪕" },
  { key: "Teclado", icon: "🎹" },
  { key: "Vocais", icon: "🎤" },

  { key: "Equipe A", icon: "💃" },
  { key: "Equipe B", icon: "💃" },

  { key: "Mídia", icon: "📸" },
  { key: "Projetor", icon: "💻" },

  { key: "PA", icon: "🎛" },
  { key: "Monitor", icon: "🎧" },
  { key: "Talkback", icon: "📢" }
];

// Campos padrão por sub-aba de escala (você pode alterar/expandir)
const ESCALA_CAMPOS = {
  banda: [
    { key: "Bateria", multi: false },
    { key: "Baixo", multi: false },
    { key: "Guitarra", multi: false },
    { key: "Violão", multi: false },
    { key: "Teclado", multi: false },
    { key: "Vocais", multi: true }
  ],
  danca: [
    { key: "Equipe", type: "equipe" }, // "Equipe A" ou "Equipe B"
    { key: "Coreo", type: "text" }
  ],
  midia: [
    { key: "Mídia", multi: false },
    { key: "Projetor", multi: false }
  ],
  som: [
    { key: "PA", multi: false },
    { key: "Monitor", multi: false }
  ]
};

// Aviso fixo do mês (aparece para todos, mesmo sem OneSignal)
const AVISO_RAIZ = {
  // PADRÃO: "aviso_YYYY_MM_DD"
  id: "aviso_2026_01_05",
  titulo: "📢 CONVOCAÇÃO GERAL",
  texto: "Convocação para todos os ministros. Toda quarta e quinta consagração pessoal com jejum oração e meditação na palavra.",
  data: "05/01/2026"
};

// ======================================
// DADOS PADRÃO DO MÊS (backup/base)
// ======================================
const DEFAULT_DATA = {
  titulos: {
    ensaiosTitulo: "CRONOGRAMA DE ESTUDO",
    ensaiosSubtitulo: "📌 Atenção!!! Mudamos o horário do ensaio, agora início às 19:15, favor não atrasar.",
    ensaiosRodape1: "📌 Obs:\nÉ necessária a presença de todos nos ensaios e reuniões do Louvor",
    ensaiosRodape2: "⚠ Atenção!!!\n📌 Atenção!!! Mudamos o horário do ensaio, agora início às 19:15, favor não atrasar.",

    discipuladoTitulo: "📖 Texto base do estudo",
    discipuladoSubtitulo: "Romanos 8:1–17 (NVI)",

    uniformesTitulo: "PADRÃO VISUAL - JANEIRO"
  },

  membros: [
    { id:"ana", nome:"Ana", aniv:"---", img:"ana.jpg", funcoes:["Mídia"] },
    { id:"cleiton", nome:"Cleiton", aniv:"09/03", img:"cleiton.jpg", funcoes:["Bateria"] },
    { id:"daniel", nome:"Daniel", aniv:"14/05", img:"daniel.jpg", funcoes:["Vocais"] },
    { id:"diego", nome:"Diego", aniv:"20/07", img:"diego.jpg", funcoes:["Guitarra"] },
    { id:"erika", nome:"Erika", aniv:"---", img:"erika.jpg", funcoes:["Equipe A"] },
    { id:"everton", nome:"Everton", aniv:"30/06", img:"everton.jpg", funcoes:["Bateria"] },
    { id:"fabio", nome:"Fábio", aniv:"13/01", img:"fabio.jpg", funcoes:["Baixo","PA","Monitor"] },
    { id:"felipy", nome:"Felipy", aniv:"---", img:"felipy.jpg", funcoes:["Projetor"] },
    { id:"fernanda", nome:"Fernanda", aniv:"10/01", img:"fernanda.jpg", funcoes:["Vocais"], aliases:["Fer"] },
    { id:"giovana", nome:"Giovana", aniv:"05/08", img:"giovana.jpg", funcoes:["Teclado"], aliases:["Gi"] },
    { id:"josy", nome:"Josy", aniv:"---", img:"josy.jpg", funcoes:["Equipe B"] },
    { id:"juninho", nome:"Juninho", aniv:"31/07", img:"juninho.jpg", funcoes:["Violão"] },
    { id:"mariana", nome:"Mariana", aniv:"---", img:"mariana.jpg", funcoes:["Mídia"] },
    { id:"nahiany", nome:"Nahiany", aniv:"---", img:"nahiany.jpg", funcoes:["Equipe A"] },
    { id:"rebeca", nome:"Rebeca", aniv:"---", img:"rebeca.jpg", funcoes:["Projetor"] },
    { id:"vanusa", nome:"Vanusa", aniv:"18/01", img:"vanusa.jpg", funcoes:["Vocais"] },
    { id:"warlly", nome:"Warlly", aniv:"---", img:"warlly.jpg", funcoes:["PA","Monitor"] },
    { id:"gabriel", nome:"Gabriel", aniv:"---", img:"gabriel.jpg", funcoes:["Baixo"] },
    { id:"ademilson", nome:"Ademilson", aniv:"---", img:"ademilson.jpg", funcoes:[] }
  ],

  escalas: {
    banda: [
      { data:"08/01", slots: { Bateria:"cleiton", Baixo:"fabio", Guitarra:"diego", "Violão":"juninho", Teclado:"giovana", Vocais:["daniel","fernanda","vanusa"] } },
      { data:"15/01", slots: { Bateria:"everton", Baixo:"gabriel", Guitarra:"diego", "Violão":"juninho", Teclado:"giovana", Vocais:["daniel","fernanda","vanusa"] } },
      { data:"22/01", slots: { Bateria:"cleiton", Baixo:"fabio", Guitarra:"diego", "Violão":"juninho", Teclado:"giovana", Vocais:["daniel","fernanda","vanusa"] } },
      { data:"29/01", slots: { Bateria:"everton", Baixo:"gabriel", Guitarra:"diego", "Violão":"juninho", Teclado:"giovana", Vocais:["daniel","fernanda","vanusa"] } }
    ],
    danca: [
      { data:"08/01", slots:{ Equipe:"Equipe A", Coreo:"Livre" } },
      { data:"15/01", slots:{ Equipe:"Equipe B", Coreo:"Livre" } },
      { data:"22/01", slots:{ Equipe:"Equipe A", Coreo:"Livre" } },
      { data:"29/01", slots:{ Equipe:"Equipe B", Coreo:"Livre" } }
    ],
    midia: [
      { data:"08/01", slots:{ "Mídia":"mariana", Projetor:"felipy" } },
      { data:"15/01", slots:{ "Mídia":"ana", Projetor:"rebeca" } },
      { data:"22/01", slots:{ "Mídia":"mariana", Projetor:"felipy" } },
      { data:"29/01", slots:{ "Mídia":"ana", Projetor:"rebeca" } }
    ],
    som: [
      { data:"08/01", slots:{ PA:"warlly", Monitor:"fabio" } },
      { data:"15/01", slots:{ PA:"fabio", Monitor:"warlly" } },
      { data:"22/01", slots:{ PA:"warlly", Monitor:"fabio" } },
      { data:"29/01", slots:{ PA:"fabio", Monitor:"warlly" } }
    ]
  },

  ensaios: [
    { data:"07/01", hora:"19:15", musicas:[
      { titulo:"Quem é como nosso Deus", cifraId:"1otoLrBVgJXRp4uCRwIyHxxWtsUCveE71", audioId:"1iY-09Jp9tDiBBocWHfoLSl5Zu8U7z7nw" },
      { titulo:"Confio em Deus", cifraId:"119HG8-dkTsTGlyCewZoScugYauZ3BObh", audioId:"1RUhox8Ycp3aFYnUWIuyQmRXr_kH36K_7" },
      { titulo:"Dependente", cifraId:"1ziJ3KpWHxaq2pdpVbnVeyfPIP3ScqP7V", audioId:"1RZLaS6VMhIFnleu6xekhSJ7aMKwtiVXb" },
      { titulo:"Gratidão", cifraId:"16EcapRn31O2YFKh8iOTtw4BLy-o3qZ9j", audioId:"1c2LcaoRr2mdKN5ysIcJEraVgD_U6UoJ7" }
    ]},
    { data:"14/01", hora:"19:15", musicas:[
      { titulo:"Messias", cifraId:"1YSvQx0lXeTb_XZVFRK2mWKdGhx1Wt8-P", audioId:"10n94X5WuvahQronMjpPY0ml_S76JHBMY" },
      { titulo:"Quero Jesus", cifraId:"1168LoJxw0daO4WarbeastuFDJQGN_E5g", audioId:"1sqifrzFg94k9O5sGpUAYQNN-JQKa-pZg" }
    ]},
    { data:"21/01", hora:"19:15", musicas:[
      { titulo:"Tudo sobre Ele", cifraId:"1AAXTNXtzeu9MWHsJlU_h3ENGRs6g6swP", audioId:"16Cyv48LhjR75h-XLENi6J5w8NPPZy_He" },
      { titulo:"Vida", cifraId:"14Z_w0GrmTOpW6fBfGHk9Kqnng7KBUDlH", audioId:"1BT4j4Oag7O8Utd8YsnK_CO6bRgbxZm6e" }
    ]},
    { data:"28/01", hora:"19:15", musicas:[
      { titulo:"Além do impossível", cifraId:"1DtvLQjv0Ais_lWBJkJXSI7i14cVfmtOs", audioId:"18UcFNyw41ifX9tj4t8KF3SJC1TcxASgC" },
      { titulo:"Jesus o plano perfeito", cifraId:"1zqbRv6Mt2SsieyvJGx3MOxGLnl49FyyI", audioId:"16_fFVQf7JdAndRY4HvwlXYlT_6AvuLKB" }
    ]}
  ],

  discipulado: {
    texto: `1 Portanto, agora já não há condenação para os que estão em Cristo Jesus,
2 porque por meio de Cristo Jesus a lei do Espírito de vida me libertou da lei do pecado e da morte.
3 Porque aquilo que a lei fora incapaz de fazer por estar enfraquecida pela carne, Deus o fez, enviando seu próprio Filho, à semelhança do homem pecador, como oferta pelo pecado. E assim condenou o pecado na carne,
4 a fim de que as exigências da lei fossem plenamente satisfeitas em nós, que não vivemos segundo a carne, mas segundo o Espírito.
5 Quem vive segundo a carne tem a mente voltada para o que a carne deseja; mas quem vive de acordo com o Espírito tem a mente voltada para o que o Espírito deseja.
6 A mentalidade da carne é morte, mas a mentalidade do Espírito é vida e paz;
7 a mentalidade da carne é inimiga de Deus porque não se submete à lei de Deus, nem pode fazê-lo.
8 Quem vive segundo a carne não pode agradar a Deus.
9 Entretanto, vocês não estão sob o domínio da carne, mas do Espírito, se de fato o Espírito de Deus habita em vocês. E, se alguém não tem o Espírito de Cristo, não pertence a Cristo.
10 Mas, se Cristo está em vocês, o corpo está morto por causa do pecado, mas o espírito está vivo por causa da justiça.
11 E, se o Espírito daquele que ressuscitou Jesus dentre os mortos habita em vocês, aquele que ressuscitou a Cristo dentre os mortos também dará vida a seus corpos mortais, por meio do seu Espírito que habita em vocês.
12 Portanto, irmãos, estamos em dívida, não para com a carne, para vivermos sujeitos a ela.
13 Pois, se vocês viverem de acordo com a carne, morrerão; mas, se pelo Espírito fizerem morrer os atos do corpo, viverão,
14 porque todos os que são guiados pelo Espírito de Deus são filhos de Deus.
15 Pois vocês não receberam um espírito que os escravize para novamente temerem, mas receberam o Espírito que os adota como filhos, por meio do qual clamamos: “Aba, Pai”.
16 O próprio Espírito testemunha ao nosso espírito que somos filhos de Deus.
17 E, se somos filhos, então somos herdeiros; herdeiros de Deus e coerdeiros com Cristo, se de fato participamos dos seus sofrimentos, para que também participemos da sua glória.`
  },

  grupos: [
    { g:"Grupo 1", l:"📕", m:"Cleiton, Fer, Gabriel, Rebeca, Josy" },
    { g:"Grupo 2", l:"📕", m:"Everton, Diego, Juninho, Vanusa, Felipe" },
    { g:"Grupo 3", l:"📕", m:"Fábio, Gi, Warlly, Mariana" },
    { g:"Grupo 4", l:"📕", m:"Daniel, Ana, Ademilson, Erica" }
  ],

  uniformes: [
    { data:"08/01", titulo:"Marrom & Preto", imagem:"marrom-preto.png" },
    { data:"15/01", titulo:"Verde & Bege", imagem:"verde-bege.png" },
    { data:"22/01", titulo:"Azul & Jeans", imagem:"azul-jeans.png" },
    { data:"29/01", titulo:"Vinho & Preto", imagem:"vinho-preto.png" }
  ],

  info: {
    louvor: {
      responsavel: "Daniel",
      driveCifras: "https://drive.google.com/drive/folders/1E9NaJEv5Sx1LV6NOEYCUFGDi32Y_h-Ch",
      driveAudios: "https://drive.google.com/drive/folders/13i3DBRcpWILsgZSgGBRUbMKlC4JfnwBL",
      textoHtml: "" // se vazio, o app usa um modelo padrão
    },
    danca: {
      responsavel: "Erika",
      textoHtml: ""
    },
    midia: {
      responsavel: "Cleiton",
      textoHtml: ""
    },
    som: {
      responsavel: "Fabio",
      textoHtml: ""
    }
  }
};
