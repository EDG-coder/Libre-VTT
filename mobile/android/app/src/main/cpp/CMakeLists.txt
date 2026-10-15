# La piccola libreria che avvia Node (nodejs-mobile). libnode.so e i suoi header li mette
# il workflow di GitHub in app/libnode/ (vedi .github/workflows/app.yml).
cmake_minimum_required(VERSION 3.18.1)
project(avvio_node CXX)

set(LIBNODE ${CMAKE_SOURCE_DIR}/../../../libnode)
add_library(avvio-node SHARED avvio-node.cpp)
target_include_directories(avvio-node PRIVATE ${LIBNODE}/include/node)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION ${LIBNODE}/bin/${ANDROID_ABI}/libnode.so)

find_library(log-lib log)
target_link_libraries(avvio-node libnode ${log-lib})
# pagine da 16 KB (i telefoni nuovi)
target_link_options(avvio-node PRIVATE "-Wl,-z,max-page-size=16384")
