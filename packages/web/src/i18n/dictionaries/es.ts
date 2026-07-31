import type { Dictionary } from './en.ts';

/**
 * Español.
 *
 * Traducido, no calcado. Donde el inglés usa una expresión hecha, esta versión
 * usa la suya, aunque las palabras no coincidan — se busca que suene escrito en
 * español y no traducido.
 *
 * Dos notas de vocabulario, coherentes en todo el archivo:
 *
 *   - **"sesión"** y no "terminal" cuando se habla al usuario. Terminal es
 *     preciso y es lo que usa la documentación; sesión es lo que la persona
 *     reconoce.
 *   - Los nombres de los modos — Dev y Coach — no se traducen. Son nombres de
 *     producto y así aparecen en la app y en el dispositivo.
 *
 * Se usa el tuteo, igual que en las demás versiones. El público es
 * desarrollador y ciclista; el usted sonaría distante y ajeno al producto.
 * Castellano neutro, evitando el léxico donde España y Latinoamérica divergen
 * lo suficiente como para chirriar.
 */
export const es = {
  meta: {
    title: 'Entrena y programa a la vez',
    description:
      'Tu sesión de código espera una sola palabra mientras sales en bici. Mírala ' +
      'en el Garmin, responde con la voz y sigue pedaleando.',
  },

  nav: {
    how: 'Cómo funciona',
    modes: 'Modos',
    pricing: 'Precios',
    docs: 'Documentación',
    signIn: 'Entrar',
    getStarted: 'Empezar',
    skipToContent: 'Saltar al contenido',
    mainNav: 'Principal',
    footerNav: 'Pie de página',
    language: 'Idioma',
  },

  hero: {
    eyebrow: 'Código abierto · Alojamiento propio',
    title: 'Entrena y programa a la vez.',
    lede:
      'Una sesión de código trabaja durante minutos, luego se detiene y espera ' +
      'una palabra. Si estás sobre la bici, esa pausa te cuesta la salida ' +
      'entera. Pon la pregunta en el manillar y respóndela en voz alta, sin parar.',
    primary: 'Empezar',
    secondary: 'Leer la documentación',
    note: 'Gratis y de código abierto. Corre en tu máquina — nada tuyo pasa por nosotros.',
  },

  proof: {
    tag: 'Dónde estamos',
    title: 'Construido y funcionando, con los límites a la vista.',
    body:
      'Esto es una herramienta que funciona, no una página para algo que aún no ' +
      'existe. Las cifras de abajo salen del repositorio y puedes comprobarlas todas.',
    stats: {
      devices: { value: '18/20', label: 'Modelos Garmin Edge compatibles' },
      tests: { value: '127', label: 'Pruebas, incluso contra tmux real' },
      size: { value: '122 KB', label: 'En el dispositivo, de 1 MB disponible' },
      cost: { value: '€0', label: 'Por alojarlo tú, para siempre' },
    },
  },

  modes: {
    tag: 'Dos modos',
    title: 'Un dispositivo en el manillar. Dos funciones.',
    body:
      'La misma app, haciendo lo que necesitas según por qué has salido. ' +
      'Ninguno de los dos te pide que pares.',

    dev: {
      name: 'Dev',
      badge: 'Disponible',
      tagline: 'Sigue produciendo mientras entrenas.',
      body:
        'Dejas de elegir entre el entrenamiento y el trabajo. La sesión avanza ' +
        'mientras tú avanzas, y cuando necesita una decisión la pregunta aparece ' +
        'en el Edge — reducida a la elección, no a una pantalla llena de texto.',
      points: [
        {
          title: 'Responde sin parar',
          body: 'Arriba y abajo mueven la selección, una pulsación confirma. Ojos en la carretera entre cada una.',
        },
        {
          title: 'Habla en vez de escribir',
          body:
            'Pulsa el botón de los auriculares y habla. Lo que digas llega como texto a la ' +
            'sesión abierta, para dirigir el trabajo con una frase en lugar de siete botones.',
        },
        {
          title: 'Revisas antes de enviar',
          body:
            'La voz llega a una sesión que edita archivos y ejecuta comandos, así que nada ' +
            'se envía hasta que has visto el texto y lo has confirmado.',
        },
      ],
    },

    coach: {
      name: 'Coach',
      badge: 'Lista de espera',
      tagline: 'Un compañero de salida que va de verdad atento.',
      body:
        'Sigue la salida mientras ocurre — tu esfuerzo frente a lo que queda por ' +
        'delante y frente a lo que ya has hecho antes — y te habla por los ' +
        'auriculares. No es otra pantalla que leer a 30 km/h.',
      points: [
        {
          title: 'El esfuerzo, leído en tiempo real',
          body: 'Yendo demasiado fuerte para lo que queda, o guardando cuando aún te sobra. Te lo dice.',
        },
        {
          title: 'El puerto antes de llegar',
          body: 'Conoce el recorrido. Oyes hablar del desnivel cuando todavía da tiempo a cambiar de plato.',
        },
        {
          title: 'Come ahora, no dentro de veinte minutos',
          body: 'Avisos de alimentación al ritmo del esfuerzo que llevas gastado, que es cuando sirven.',
        },
        {
          title: 'La voz que necesitas a la tercera hora',
          body: 'Tiene tu historial. Cuando vas mejor de lo que sientes, oírlo vale algo.',
        },
      ],
      waitlist: {
        title: 'El Coach todavía no está hecho.',
        body:
          'Es lo siguiente que se va a construir, y es más honesto decirlo que ' +
          'enseñarte una tarjeta igual a la de algo que ya funciona. Deja tu ' +
          'correo y te enteras cuando sea real.',
        placeholder: 'tu@ejemplo.com',
        cta: 'Apuntarme a la lista',
        privacy: 'Un correo cuando esté listo. Nada más, y sin compartirlo con nadie.',
        success: 'Estás en la lista. Recibirás un mensaje, uno solo, cuando funcione.',
        error: 'No se ha podido. Inténtalo de nuevo en un momento.',
        invalid: 'Eso no parece una dirección de correo.',
      },
    },
  },

  how: {
    tag: 'Cómo se conecta',
    title: 'Tres piezas, y dos ya son tuyas.',
    body:
      'Un Garmin Edge no tiene WiFi propio. Llega a internet a través de la app ' +
      'Garmin Connect del móvil que ya llevas en el bolsillo, por Bluetooth — ' +
      'así que no hay nada que instalar ni nada más que pagar.',
    steps: [
      {
        title: 'Tu máquina',
        body: 'La sesión corre en tmux, donde ya corre. Un puente pequeño lee el panel.',
      },
      {
        title: 'Tu móvil',
        body: 'Garmin Connect encamina la petición y lleva tu voz. Ya está instalado.',
      },
      {
        title: 'Tu Edge',
        body: 'Muestra lo que se está preguntando y devuelve tu respuesta.',
      },
    ],
    note:
      'El puente corre en tu máquina o en tu propio VPS. El contenido de la ' +
      'sesión se cifra en tus dispositivos antes de salir, y por eso aquí la ' +
      'privacidad es una propiedad del diseño y no una promesa.',
  },

  limits: {
    tag: 'Antes de dedicarle una tarde',
    title: 'Lo que no hace.',
    body:
      'Dicho aquí en vez de descubierto después. Convierte peor y devuelve ' +
      'mejor, que es el intercambio correcto.',
    items: [
      {
        title: 'Las columnas todavía no cuadran.',
        body:
          'Connect IQ no trae ninguna tipografía monoespaciada, así que los diffs ' +
          'y las tablas salen en una proporcional. Una fuente de mapa de bits es ' +
          'lo siguiente que se va a hacer.',
      },
      {
        title: 'Los textos largos son cosa del móvil.',
        body:
          'El Edge tiene teclado, pero son siete botones. Vale para una ' +
          'corrección y no para un párrafo — que es para lo que está la voz.',
      },
      {
        title: 'Dos modelos de Edge no pueden.',
        body:
          'El 130 y el 130 Plus no admiten aplicaciones en el propio hardware. Es ' +
          'un límite del aparato, no una decisión nuestra. Todos los demás funcionan.',
      },
      {
        title: 'Necesitas HTTPS con un certificado de verdad.',
        body:
          'Connect IQ rechaza HTTP sin cifrar y los certificados autofirmados. Un ' +
          'túnel gratuito basta, y la documentación explica cómo.',
      },
    ],
  },

  pricing: {
    tag: 'Precios',
    title: 'Un precio, o ninguno.',
    body:
      'Alojarlo tú es completo y gratis, para siempre. El plan de pago vende ' +
      'comodidad — no desbloquea capacidades que se estuvieran reteniendo.',
    monthly: 'Mensual',
    yearly: 'Anual',
    save: 'Ahorra 20%',
    perMonth: '/mes',
    features: 'Lo que incluye',

    plans: {
      free: {
        name: 'Alojamiento propio',
        description:
          'Todo entero, corriendo en tu máquina. Sin cuenta, sin pasar por ' +
          'nosotros, sin límite que caduque.',
        price: '€0',
        cta: 'Ver la guía de instalación',
        features: [
          'Todas las funciones del modo Dev',
          'Sesiones sin límite',
          'Tu máquina, tu red',
          'Código completo, AGPL-3.0',
          'Soporte de la comunidad en GitHub',
        ],
      },
      pro: {
        name: 'Alojado',
        description:
          'El mismo producto sin la instalación. Nosotros nos ocupamos de la ' +
          'conexión para que no tengas que configurar un túnel.',
        price: '€5',
        cta: '14 días gratis',
        features: [
          'Todo lo del alojamiento propio',
          'Nada que configurar — se conecta solo',
          'Voz, para hablar en vez de escribir',
          'Hasta 5 sesiones',
          'Modo Coach cuando exista',
        ],
      },
    },

    note:
      'El contenido de la sesión se cifra en tus dispositivos en cualquiera de ' +
      'los dos casos. En el plan alojado pasa por nosotros como bytes que no ' +
      'podemos leer.',
  },

  faq: {
    tag: 'Preguntas',
    title: 'Las preguntas que merece la pena responder.',
    items: [
      {
        q: '¿Tengo que parar de pedalear para usarlo?',
        a:
          'No — ese es justamente el objetivo. Responder son dos pulsaciones de un botón ' +
          'que ya tienes bajo el pulgar, y hablar es una. Si algo no se puede hacer con ' +
          'seguridad en movimiento, no está en el dispositivo.',
      },
      {
        q: '¿Podéis leer mi sesión?',
        a:
          'No. El contenido se cifra en tus dispositivos con una clave derivada de una ' +
          'contraseña que tú defines, y esa contraseña nunca llega hasta nosotros. En el ' +
          'plan alojado encaminamos bytes que no podemos abrir. La consecuencia es real y ' +
          'conviene saberla: si la olvidas, no podemos recuperarla por ti.',
      },
      {
        q: '¿Qué modelos de Garmin Edge funcionan?',
        a:
          'Dieciocho de los veinte que existen. El Edge 130 y el 130 Plus no pueden ' +
          'ejecutar ninguna aplicación — es una limitación del hardware, no una elección ' +
          'nuestra. Todos los demás son compatibles.',
      },
      {
        q: '¿Necesito también un móvil?',
        a:
          'Sí. El Edge no tiene WiFi y llega a internet a través de Garmin Connect en tu ' +
          'móvil, por Bluetooth. Es casi seguro que ya lo tienes instalado, y puede ' +
          'quedarse en el bolsillo.',
      },
      {
        q: '¿Alojarlo yo es una versión recortada?',
        a:
          'No. Es el mismo software sin nada quitado, y va a seguir siendo así. El plan de ' +
          'pago te ahorra trabajo de instalación; no desbloquea funciones que estuvieran ' +
          'esperando.',
      },
      {
        q: '¿Y si no entiende lo que he dicho?',
        a:
          'Ves el texto antes de que se envíe nada, y lo confirmas. El viento y la ' +
          'respiración agitada son justo las condiciones donde el reconocimiento falla ' +
          'más, y al otro lado hay una sesión que edita archivos — así que revisar no es ' +
          'opcional.',
      },
    ],
  },

  cta: {
    title: 'Sal a rodar. Sigue trabajando.',
    body:
      'Está todo en código abierto. Léelo antes de ejecutarlo junto a un ' +
      'terminal que guarda tus credenciales — ese instinto es el correcto, y se ' +
      'construyó pensando en él.',
    primary: 'Empezar',
    secondary: 'Ver el código',
  },

  footer: {
    docs: 'Documentación',
    privacy: 'Privacidad',
    terms: 'Términos',
    source: 'Código',
    disclaimer:
      'Sin afiliación con Garmin ni Anthropic. Garmin, Edge y Connect IQ son marcas de ' +
      'Garmin Ltd. Claude y Claude Code son productos de Anthropic.',
    rights: 'Todos los derechos reservados.',
  },
} satisfies Dictionary;
