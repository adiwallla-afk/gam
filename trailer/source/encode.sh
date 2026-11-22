#!/bin/bash
# usage: encode.sh <frames-dir> <out.mp4>
set -e
dir=$1; out=$2; X=0.5; tmp=$(mktemp -d)
inputs=(); durs=(); i=0
for d in $(ls "$dir" | sort); do
  ffmpeg -loglevel error -y -framerate 30 -i "$dir/$d/%05d.jpg" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p "$tmp/$i.mp4"
  durs+=($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp/$i.mp4")); inputs+=(-i "$tmp/$i.mp4"); i=$((i+1))
done
f=""; prev="[0:v]"; off=0
for ((k=1;k<i;k++)); do
  off=$(python3 -c "print(round($off+${durs[$((k-1))]}-$X,3))")
  f+="$prev[$k:v]xfade=transition=fade:duration=$X:offset=$off[v$k];"; prev="[v$k]"
done
# fade in from black at start, fade out at end
total=$(python3 -c "print(round($off+${durs[$((i-1))]},3))")
f+="${prev}fade=t=in:st=0:d=0.6,fade=t=out:st=$(python3 -c "print($total-0.8)"):d=0.8,format=yuv420p[out]"
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "$f" -map "[out]" -c:v libx264 -preset slow -crf 20 -movflags +faststart -r 30 "$out"
rm -rf "$tmp"; echo "$out $total s"
