# Penales de otro universo

Primer juego de Rafa: penales con poderes, para navegador y celular en horizontal.

## Jugar

Juego público: **https://penales-de-otro-universo.vercel.app/**. Abrí el enlace desde el celular y giralo en horizontal.

Abrí `index.html` en un navegador. No hace falta instalar nada, crear una cuenta ni conectarse a una base de datos. También funciona desde cualquier alojamiento de archivos estáticos HTTPS: hay que subir juntos `index.html`, `styles.css`, `rules.js`, `game.js`, `manifest.webmanifest` e `icon.svg`.

Para probar en esta computadora con Node instalado: `node serve.cjs`. Abrí `http://localhost:4173`. El servidor de prueba escucha solamente en esta computadora. Para otro celular usá el enlace público de arriba.

## Controles

- Patear: arrastrar desde la pelota hacia un lugar del arco y soltar. Apuntar afuera hace que el tiro salga.
- Atajar: deslizar en la dirección de la pelota; volver a deslizar permite corregir la dirección. La velocidad del arquero está limitada: no se teletransporta.
- Sub-Zero: mientras viaja la pelota, tocar la cancha o el botón para congelar, y otra vez para soltar. Al soltar (o al pasar tres segundos) cambia a otro destino sorpresa dentro del arco, sin teletransportarse. Una congelación por tiro. Un tiro apuntado afuera sigue saliendo afuera.
- Teclado: flechas para apuntar/mover al arquero, Enter para patear, espacio para congelar/soltar.
- Botón ⛶: entrar/salir de pantalla completa desde cualquier pantalla. Si el navegador no admite la API, activa una vista ampliada y muestra una guía para abrir el juego como app desde la pantalla de inicio de Safari.
- Ayuda y salida pausan la jugada; cambiar de pestaña también. En un celular vertical se muestra una invitación a girarlo y se pausa hasta girarlo o elegir jugar así.

## Reglas acordadas

Elegís uno de siete personajes por partido. El rival es aleatorio entre todos (puede ser el mismo). Gokú usa un Kamehameha más rápido; Naruto, dos clones que desaparecen al 72% del recorrido; Sub-Zero, congelación manual. El juego decide cuándo congelar/soltar los tiros rivales de Sub-Zero.

Pikachu recorre una trayectoria angular en zigzag que termina en el lugar apuntado. Peppa tapa la visión del arquero entre el 28% y el 68% del vuelo; el barro no se mueve siguiendo la pelota. Fantasma Real oculta la pelota, incluyendo su aura, entre el 20% y el 65%: reaparece con el 35% del recorrido restante y cambia a otro destino aleatorio, sin teletransportarse. Spider-Man ancla al arquero durante el primer 55% del vuelo; las flechas y deslizamientos no pueden moverlo ni preparar un movimiento durante ese tiempo. Se libera con el 45% restante. Las telarañas rodean sus pies y se dibujan delante del arquero, detrás del pateador. El arquero rival tampoco recibe posiciones nuevas mientras está ciego y también queda anclado con las telarañas. Las ventanas se adaptan a la duración de cada dificultad: invisibilidad dura aproximadamente 0.63–0.97 segundos y deja 0.49–0.75 segundos de reacción.

Son cinco tiros por jugador alternando patear/atajar. Se completan siempre los cinco. Si hay empate se agregan pares de tiros hasta que uno gane. Fácil, medio y difícil cambian reflejos/precisión del arquero rival y velocidad de sus tiros. Hay sonidos sintetizados (sin música), resultado, celebración y revancha.

El arco usa coordenadas de -1 a 1. Las manos, cabeza, brazos, torso y piernas del arquero tienen geometría de contacto compartida con el dibujo, incluida su inclinación. El choque se evalúa cuando la pelota llega al plano del arco (100% del recorrido): una superposición de la pelota con los pies durante el vuelo es perspectiva, no una atajada. Todos los tiros, incluso los rápidos, se evalúan exactamente en ese plano sin saltear el punto de llegada. La pelota queda visible en el punto de contacto. Los clones falsos nunca provocan una atajada.

Gokú ahora usa un factor de velocidad 2.5 (antes 2.2): aproximadamente un 14% adicional de velocidad. Es rápido, pero el contacto con el arquero sigue contando. Sub-Zero cambia el destino aleatoriamente al descongelar; el rival reacciona con demora al nuevo destino, sin adivinarlo mientras está congelado. Naruto conserva su poder.

Las ilustraciones son dibujos vectoriales originales estilizados de los personajes, con proporciones más largas, sombras, ropa y guantes detallados; no son imágenes ni voces oficiales. No se guardan partidas ni se cargan recursos externos.

## Archivos

La cancha llena el ancho y alto disponibles, incluyendo cambios de orientación y de altura de las barras del navegador. Los personajes y la pelota mantienen proporciones uniformes; las zonas de contacto usan el mismo factor horizontal. En Safari sin API de pantalla completa, el botón ofrece vista ampliada. Para quitar las barras del navegador en iPhone, usar Compartir → Agregar a pantalla de inicio → Abrir como app web (si aparece) y abrir desde ese icono. El manifiesto y las etiquetas de Apple configuran el modo standalone. No hay un service worker ni se promete funcionamiento offline desde el enlace público. Referencia: https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios.

- `index.html`: pantallas y botones.
- `styles.css`: aspecto visual y tamaños para celular.
- `rules.js`: puntajes, turnos, desempate, atajadas y límites del hielo.
- `game.js`: controles, rival, animación, dibujos y sonidos.
- `tests/rules.test.cjs`: pruebas de las reglas, sin dependencias.
- `serve.cjs`: servidor local opcional para probar.
- `manifest.webmanifest`, `icon.svg`: modo de app e icono.

Validación: `node --test tests/rules.test.cjs`, `node --check game.js`, `node --check rules.js`.

Los recorridos de navegador están en `output/playwright/`. `new-heroes.cjs` admite `BASE_URL` para verificar también el despliegue. Usan Playwright del entorno de pruebas; el juego no depende de ese paquete. Las pruebas verifican invisibilidad real, ausencia de pelota bajo el barro y bloqueo/liberación del arquero, además de partidos y los poderes anteriores.

## Despliegue estático en Vercel

`vercel.json` evita instalaciones y compilaciones. `.vercelignore` limita el contenido publicado a los archivos del juego. No hay funciones, almacenamiento, servicios de IA, dominios comprados ni integraciones pagas. Los dibujos y sonidos se generan en el dispositivo del jugador. El tráfico usa las cuotas de la cuenta Vercel existente; excederlas puede producir cargos del proveedor. No se modifican suscripciones ni límites globales de otros proyectos.

El sitio está publicado en https://penales-de-otro-universo.vercel.app/. No se añadieron funciones, almacenamiento ni servicios externos. La API disponible no permitió confirmar el plan ni el consumo de la cuenta; el tráfico del sitio está sujeto a los límites y condiciones del plan existente. La configuración local de Vercel está excluida del repositorio.
