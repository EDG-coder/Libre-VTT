// Le funzioni in C che usa Swift.
#include <stdint.h>
#include "AvvioNode.h"

/// Il collegamento a distanza (uffa-link, Rust, in UffaLink.xcframework): accende la porta di
/// controllo su 127.0.0.1 e ne restituisce il numero (0 se non è partito). Vedi uffa-link/src/lib.rs.
uint16_t uffa_link_avvia(const char *segreto);
