// Avvia Node.js (nodejs-mobile) in un thread suo, con uno stack grande.
#ifndef AVVIO_NODE_H
#define AVVIO_NODE_H

/// Esegue `node <script>` in un thread nuovo. Ritorna 0 se il thread è partito.
int avvio_node(const char *script);

#endif
