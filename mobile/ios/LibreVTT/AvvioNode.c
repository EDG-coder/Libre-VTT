// Node vuole gli argomenti in un unico blocco di memoria contiguo (libuv ci conta) e uno
// stack più grande di quello dei thread normali di iOS (512 KB).
#include "AvvioNode.h"
#include <pthread.h>
#include <stdlib.h>
#include <string.h>

// da NodeMobile.framework (nodejs-mobile)
extern int node_start(int argc, char *argv[]);

static void *corri(void *arg) {
    char **argv = (char **)arg;
    int argc = 0;
    while (argv[argc]) argc++;
    node_start(argc, argv);
    return NULL;
}

int avvio_node(const char *script) {
    const char *primo = "node";
    size_t l1 = strlen(primo) + 1, l2 = strlen(script) + 1;
    char *blocco = (char *)calloc(l1 + l2, 1);       // resta vivo per tutta la vita di Node
    char **argv = (char **)calloc(3, sizeof(char *));
    if (!blocco || !argv) return -1;
    memcpy(blocco, primo, l1);
    memcpy(blocco + l1, script, l2);
    argv[0] = blocco;
    argv[1] = blocco + l1;
    argv[2] = NULL;

    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, 8 * 1024 * 1024);
    pthread_t t;
    int r = pthread_create(&t, &attr, corri, argv);
    pthread_attr_destroy(&attr);
    if (r == 0) pthread_detach(t);
    return r;
}
