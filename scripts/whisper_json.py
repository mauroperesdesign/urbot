"""Transcreve um áudio com o Whisper (faster-whisper) e imprime os trechos em JSON.

Uso: python whisper_json.py arquivo.wav [--musica]   (WAV 16 kHz, mono, 16 bits — o ffmpeg converte antes)
  --musica  não corta o silêncio (pontos cantados têm música de fundo)
Variáveis: WHISPER_MODEL (padrão: small), WHISPER_DIR (pasta dos modelos).
"""
import json
import os
import sys
import wave

import numpy as np
from faster_whisper import WhisperModel

path = sys.argv[1]
music = '--musica' in sys.argv[2:]
model = WhisperModel(os.environ.get('WHISPER_MODEL', 'small'), device='cpu', compute_type='int8',
                     download_root=os.environ.get('WHISPER_DIR') or None,
                     cpu_threads=int(os.environ.get('WHISPER_THREADS', '2')))
with wave.open(path, 'rb') as w:
    audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
# Vocabulário da Umbanda para o reconhecimento acertar nomes de Orixás, linhas e saudações
VOCAB = ('Umbanda, terreiro, gira, congá, curimba, ponto cantado, Zambi, Oxalá, Ogum, Oxóssi, Xangô, Iemanjá, Oxum, '
         'Iansã, Nanã, Obaluaiê, Omolu, Ibeji, Exu, Pombagira, Preto Velho, Caboclo, Erê, Baiano, Boiadeiro, Marinheiro, '
         'Cigano, Malandro, saravá, axé, Aruanda, Jurema, demanda, general.')
segments, info = model.transcribe(audio, language='pt', beam_size=5, vad_filter=not music,
                                  condition_on_previous_text=not music, initial_prompt=VOCAB)
out = [{'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip()} for s in segments if s.text.strip()]
print(json.dumps({'duration': round(info.duration, 1), 'segments': out}, ensure_ascii=False))
