#!/bin/bash
# Fa dimenticare a "LIBRE VTT.app" quale cartella usava, così al prossimo avvio te la richiede.
# Serve solo se hai spostato o rinominato la cartella del gioco, oppure ne hai scompattata una
# nuova e vuoi che l'app (se è in Applicazioni) punti a quella nuova invece che alla vecchia.
rm -f "$HOME/Library/Application Support/LIBRE VTT/cartella.txt"
echo "Fatto: alla prossima apertura di LIBRE VTT ti verrà richiesta la cartella."
read -r -p "Premi Invio per chiudere." _
