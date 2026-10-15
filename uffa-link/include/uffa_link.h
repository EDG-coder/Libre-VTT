/* uffa-link come libreria (app per iPhone e iPad).
 *
 * uffa_link_avvia accende la «porta di controllo» su 127.0.0.1 e ne restituisce il numero
 * (0 se non è stato possibile). Va chiamata una volta sola: le chiamate successive
 * restituiscono la stessa porta. L'avviatore di LIBRE VTT apre e chiude le sessioni da lì;
 * `segreto` è la parola che deve mettere davanti a ogni comando (vedi src/controllo.rs).
 */
#ifndef UFFA_LINK_H
#define UFFA_LINK_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

uint16_t uffa_link_avvia(const char *segreto);

#ifdef __cplusplus
}
#endif

#endif
