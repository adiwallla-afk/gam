#!/bin/bash
# usage: encode2.sh <frames-dir> <out.mp4>   (scenes crossfaded + original music)
set -e
dir=$1; out=$2; X=0.6; tmp=$(mktemp -d)
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
total=$(python3 -c "print(round($off+${durs[$((i-1))]},3))")
f+="${prev}fade=t=in:st=0:d=0.8,fade=t=out:st=$(python3 -c "print($total-1.0)"):d=1.0,format=yuv420p[out]"
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "$f" -map "[out]" -c:v libx264 -preset slow -crf 20 -r 30 "$tmp/video.mp4"
python3 "$(dirname "$0")/music.py" "$tmp/music.wav" "$total"
ffmpeg -loglevel error -y -i "$tmp/video.mp4" -i "$tmp/music.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$out"
rm -rf "$tmp"; echo "$out $total s"
