// Avvia Node.js (nodejs-mobile) dentro l'app: Nativo.avviaNode(String[] argomenti).
// Node vuole gli argomenti in un unico blocco di memoria contiguo (libuv ci conta), e scrive
// su stdout/stderr: li si gira al registro di Android (logcat, etichetta «LIBRE VTT»).
#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>
#include "node.h"

static int tubo_out[2], tubo_err[2];
static const char *ETICHETTA = "LIBRE VTT";

static void *leggi(void *arg) {
    int fd = *(int *)arg;
    int livello = fd == tubo_err[0] ? ANDROID_LOG_WARN : ANDROID_LOG_INFO;
    char buf[2048];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(livello, ETICHETTA, buf);
    }
    return nullptr;
}

static void devia_uscite() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(tubo_out) == 0 && dup2(tubo_out[1], STDOUT_FILENO) >= 0) {
        pthread_t t; if (pthread_create(&t, nullptr, leggi, &tubo_out[0]) == 0) pthread_detach(t);
    }
    if (pipe(tubo_err) == 0 && dup2(tubo_err[1], STDERR_FILENO) >= 0) {
        pthread_t t; if (pthread_create(&t, nullptr, leggi, &tubo_err[0]) == 0) pthread_detach(t);
    }
}

extern "C" JNIEXPORT jint JNICALL
Java_app_librevtt_Nativo_avviaNode(JNIEnv *env, jclass, jobjectArray argomenti) {
    const jsize n = env->GetArrayLength(argomenti);
    std::vector<std::string> pezzi;
    size_t totale = 0;
    for (jsize i = 0; i < n; i++) {
        auto s = (jstring)env->GetObjectArrayElement(argomenti, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        pezzi.emplace_back(c);
        env->ReleaseStringUTFChars(s, c);
        env->DeleteLocalRef(s);
        totale += pezzi.back().size() + 1;
    }
    // un solo blocco, che resta vivo per tutta la vita di Node
    char *blocco = (char *)calloc(totale, 1);
    std::vector<char *> argv;
    char *p = blocco;
    for (auto &s : pezzi) {
        memcpy(p, s.c_str(), s.size() + 1);
        argv.push_back(p);
        p += s.size() + 1;
    }
    devia_uscite();
    return (jint)node::Start((int)argv.size(), argv.data());
}
