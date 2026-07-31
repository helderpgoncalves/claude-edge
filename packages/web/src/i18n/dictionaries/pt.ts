import type { Dictionary } from './en.ts';

/**
 * Português.
 *
 * Traduzido, não decalcado. Onde o inglês usa uma expressão idiomática, a
 * versão portuguesa usa a sua, mesmo que as palavras não correspondam — o
 * objectivo é que soe escrito em português, não traduzido do inglês.
 *
 * Duas notas de vocabulário, mantidas coerentes em todo o ficheiro:
 *
 *   - **"sessão"** e não "terminal" quando se fala com o utilizador. Terminal é
 *     preciso e é o que os docs usam; sessão é o que a pessoa reconhece.
 *   - Os nomes dos modos — Dev e Coach — não se traduzem. São nomes de produto
 *     e são assim que aparecem na app e no dispositivo.
 *
 * Português europeu. Um leitor brasileiro recebe esta página em vez da
 * inglesa, o que é preferível, e o texto evita as construções onde as duas
 * variantes divergem ao ponto de incomodar.
 */
export const pt = {
  meta: {
    title: 'Treina e trabalha ao mesmo tempo',
    description:
      'A tua sessão de código fica à espera de uma palavra enquanto andas de bicicleta. ' +
      'Vê-a no Garmin, responde com a voz, e continua a pedalar.',
  },

  nav: {
    how: 'Como funciona',
    modes: 'Modos',
    pricing: 'Preços',
    docs: 'Documentação',
    signIn: 'Entrar',
    getStarted: 'Começar',
    skipToContent: 'Saltar para o conteúdo',
    mainNav: 'Principal',
    footerNav: 'Rodapé',
    language: 'Idioma',
  },

  hero: {
    eyebrow: 'Código aberto · Alojamento próprio',
    title: 'Treina e trabalha ao mesmo tempo.',
    lede:
      'Uma sessão de código corre durante minutos, depois pára e espera por uma ' +
      'palavra. Se estás em cima da bicicleta, essa pausa custa-te o treino ' +
      'inteiro. Põe a pergunta no guiador e responde em voz alta, sem parar.',
    primary: 'Começar',
    secondary: 'Ler a documentação',
    note: 'Gratuito e de código aberto. Corre na tua máquina — nada do que é teu passa por nós.',
  },

  proof: {
    tag: 'Onde estamos',
    title: 'Construído e a funcionar, com os limites à vista.',
    body:
      'Isto é uma ferramenta que funciona, não uma página para algo que ainda ' +
      'não existe. Os números abaixo vêm do repositório e podes verificar todos.',
    stats: {
      devices: { value: '18/20', label: 'Modelos Garmin Edge suportados' },
      tests: { value: '127', label: 'Testes, incluindo contra tmux real' },
      size: { value: '122 KB', label: 'No dispositivo, de 1 MB disponível' },
      cost: { value: '€0', label: 'Para alojares tu, para sempre' },
    },
  },

  modes: {
    tag: 'Dois modos',
    title: 'Um dispositivo no guiador. Duas funções.',
    body:
      'A mesma app, a fazer o que precisas consoante a razão por que saíste. ' +
      'Nenhum dos dois te pede para parar.',

    dev: {
      name: 'Dev',
      badge: 'Disponível',
      tagline: 'Continua a produzir enquanto treinas.',
      body:
        'Deixas de ter de escolher entre o treino e o trabalho. A sessão corre ' +
        'enquanto tu corres, e quando precisa de uma decisão a pergunta aparece ' +
        'no Edge — reduzida à escolha, não a um ecrã cheio de texto.',
      points: [
        {
          title: 'Responde sem parar',
          body: 'Cima e baixo movem a selecção, um toque confirma. Olhos na estrada entre cada um.',
        },
        {
          title: 'Fala em vez de escrever',
          body:
            'Carrega no botão dos auscultadores e fala. O que disseres chega como texto à ' +
            'sessão aberta, para conduzires o trabalho com uma frase em vez de sete botões.',
        },
        {
          title: 'Revês antes de enviar',
          body:
            'A voz chega a uma sessão que edita ficheiros e corre comandos, por isso nada ' +
            'é enviado antes de teres visto o texto e confirmado.',
        },
      ],
    },

    coach: {
      name: 'Coach',
      badge: 'Lista de espera',
      tagline: 'Um parceiro de treino que está mesmo atento.',
      body:
        'Acompanha o treino à medida que acontece — o teu esforço em relação ao ' +
        'que ainda falta, e ao que já fizeste antes — e fala contigo pelos ' +
        'auscultadores. Não é mais um ecrã para leres a 30 km/h.',
      points: [
        {
          title: 'O esforço, lido em tempo real',
          body: 'A ir forte de mais para o que falta, ou a poupar quando ainda tens. Ele diz-te.',
        },
        {
          title: 'A subida antes de lá chegares',
          body: 'Conhece o percurso. Ouves falar da inclinação enquanto ainda dá para mudar de mudança.',
        },
        {
          title: 'Come agora, não daqui a vinte minutos',
          body: 'Avisos de alimentação no tempo do esforço que realmente gastaste, que é quando contam.',
        },
        {
          title: 'A voz que precisas à terceira hora',
          body: 'Tem o teu histórico. Quando estás melhor do que sentes, ouvir isso vale alguma coisa.',
        },
      ],
      waitlist: {
        title: 'O Coach ainda não está feito.',
        body:
          'É a próxima coisa a ser construída, e é mais honesto dizê-lo do que ' +
          'mostrar-te um cartão igual ao de uma funcionalidade que já existe. ' +
          'Deixa o teu email e sabes quando for real.',
        placeholder: 'tu@exemplo.com',
        cta: 'Entrar na lista',
        privacy: 'Um email quando estiver pronto. Mais nada, e não se partilha com ninguém.',
        success: 'Estás na lista. Recebes uma mensagem, uma só, quando funcionar.',
        error: 'Não foi possível. Tenta outra vez daqui a pouco.',
        invalid: 'Isso não parece um endereço de email.',
      },
    },
  },

  how: {
    tag: 'Como se liga',
    title: 'Três peças, e duas já são tuas.',
    body:
      'Um Garmin Edge não tem WiFi próprio. Chega à internet através da app ' +
      'Garmin Connect no telemóvel que já levas no bolso, por Bluetooth — por ' +
      'isso não há nada a instalar nem nada a pagar além disso.',
    steps: [
      {
        title: 'A tua máquina',
        body: 'A sessão corre no tmux, onde já corre. Uma ponte pequena lê o painel.',
      },
      {
        title: 'O teu telemóvel',
        body: 'O Garmin Connect encaminha o pedido e leva a tua voz. Já está instalado.',
      },
      {
        title: 'O teu Edge',
        body: 'Mostra o que está a ser perguntado e envia a tua resposta de volta.',
      },
    ],
    note:
      'A ponte corre na tua máquina ou no teu VPS. O conteúdo da sessão é ' +
      'cifrado nos teus dispositivos antes de sair, e é por isso que a ' +
      'privacidade aqui é uma propriedade do desenho e não uma promessa.',
  },

  limits: {
    tag: 'Antes de lhe dedicares uma noite',
    title: 'O que não faz.',
    body:
      'Dito aqui em vez de descoberto depois. Converte pior e devolve melhor, ' +
      'que é a troca certa.',
    items: [
      {
        title: 'As colunas ainda não alinham.',
        body:
          'O Connect IQ não traz nenhuma fonte monoespaçada, por isso diffs e ' +
          'tabelas aparecem numa fonte proporcional. Uma fonte bitmap é a ' +
          'próxima coisa a ser feita.',
      },
      {
        title: 'Textos longos pertencem ao telemóvel.',
        body:
          'O Edge tem teclado, mas são sete botões. Chega para uma correcção e ' +
          'não chega para um parágrafo — que é para isso que existe a voz.',
      },
      {
        title: 'Dois modelos de Edge não conseguem.',
        body:
          'O 130 e o 130 Plus não têm suporte para apps no próprio hardware. É ' +
          'um limite do aparelho, não uma decisão nossa. Todos os outros funcionam.',
      },
      {
        title: 'Precisas de HTTPS com certificado a sério.',
        body:
          'O Connect IQ rejeita HTTP simples e certificados auto-assinados. Um ' +
          'túnel gratuito chega, e a documentação explica como.',
      },
    ],
  },

  pricing: {
    tag: 'Preços',
    title: 'Um preço, ou nenhum.',
    body:
      'Alojares tu é completo e gratuito, para sempre. O plano pago vende ' +
      'conveniência — não desbloqueia capacidades que estejam a ser retidas.',
    monthly: 'Mensal',
    yearly: 'Anual',
    save: 'Poupa 20%',
    perMonth: '/mês',
    features: 'O que tens',

    plans: {
      free: {
        name: 'Alojamento próprio',
        description:
          'A coisa toda, a correr na tua máquina. Sem conta, sem passar por ' +
          'nós, sem limite que expire.',
        price: '€0',
        cta: 'Ver o guia de instalação',
        features: [
          'Todas as funcionalidades do modo Dev',
          'Sessões sem limite',
          'A tua máquina, a tua rede',
          'Código completo, AGPL-3.0',
          'Apoio da comunidade no GitHub',
        ],
      },
      pro: {
        name: 'Alojado',
        description:
          'O mesmo produto sem a instalação. Somos nós a tratar da ligação ' +
          'para não teres de configurar um túnel.',
        price: '€5',
        cta: '14 dias grátis',
        features: [
          'Tudo o que está no alojamento próprio',
          'Nada para configurar — liga-se sozinho',
          'Voz, para falares em vez de escrever',
          'Até 5 sessões',
          'Modo Coach quando existir',
        ],
      },
    },

    note:
      'O conteúdo da sessão é cifrado nos teus dispositivos em qualquer dos ' +
      'casos. No plano alojado passa por nós como bytes que não conseguimos ler.',
  },

  faq: {
    tag: 'Perguntas',
    title: 'As perguntas que vale a pena responder.',
    items: [
      {
        q: 'Tenho de parar de pedalar para usar isto?',
        a:
          'Não — é precisamente esse o objectivo. Responder são dois toques num botão ' +
          'que já está debaixo do teu polegar, e falar é um. Se uma coisa não se puder ' +
          'fazer em segurança em andamento, não está no dispositivo.',
      },
      {
        q: 'Conseguem ler a minha sessão?',
        a:
          'Não. O conteúdo é cifrado nos teus dispositivos com uma chave derivada de ' +
          'uma frase-passe que defines, e essa frase nunca chega até nós. No plano ' +
          'alojado encaminhamos bytes que não conseguimos abrir. A consequência é real ' +
          'e convém saberes: se te esqueceres da frase-passe, não a podemos recuperar.',
      },
      {
        q: 'Que modelos de Garmin Edge funcionam?',
        a:
          'Dezoito dos vinte que existem. O Edge 130 e o 130 Plus não conseguem correr ' +
          'nenhuma app — é uma limitação do hardware e não uma escolha nossa. Todos os ' +
          'outros são suportados.',
      },
      {
        q: 'Preciso também de telemóvel?',
        a:
          'Sim. O Edge não tem WiFi e chega à internet através do Garmin Connect no teu ' +
          'telemóvel, por Bluetooth. É quase certo que já o tens instalado, e pode ficar ' +
          'no bolso.',
      },
      {
        q: 'Alojar eu próprio é uma versão limitada?',
        a:
          'Não. É o mesmo software sem nada retirado, e assim vai continuar. O plano ' +
          'pago tira-te trabalho de instalação; não desbloqueia funcionalidades que ' +
          'estivessem à espera.',
      },
      {
        q: 'E se não perceber o que eu disse?',
        a:
          'Vês o texto antes de alguma coisa ser enviada, e confirmas. Vento e respiração ' +
          'ofegante são exactamente as condições onde o reconhecimento falha mais, e do ' +
          'outro lado está uma sessão que edita ficheiros — por isso rever não é opcional.',
      },
    ],
  },

  cta: {
    title: 'Vai treinar. Continua a trabalhar.',
    body:
      'Está tudo em código aberto. Lê antes de o correres ao lado de um ' +
      'terminal que guarda as tuas credenciais — esse instinto é o correcto, e ' +
      'foi a pensar nele que isto foi feito.',
    primary: 'Começar',
    secondary: 'Ver o código',
  },

  footer: {
    docs: 'Documentação',
    privacy: 'Privacidade',
    terms: 'Termos',
    source: 'Código',
    disclaimer:
      'Sem qualquer afiliação com a Garmin ou a Anthropic. Garmin, Edge e Connect IQ ' +
      'são marcas da Garmin Ltd. Claude e Claude Code são produtos da Anthropic.',
    rights: 'Todos os direitos reservados.',
  },
} satisfies Dictionary;
