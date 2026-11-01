# ColorLab — beta 0.2

Aplicação web de colorimetria digital para estimar a concentração relativa de corante azul em soluções aquosas.

## Executar

Sirva esta pasta por HTTPS ou `localhost` para liberar a câmera. Exemplo com Python:

```bash
python -m http.server 8000
```

Abra `http://localhost:8000`. Em um celular, `localhost` aponta para o próprio celular; para testar pelo celular na mesma rede, use um servidor HTTPS acessível na rede ou hospede a aplicação em HTTPS.

## Fluxo experimental

1. Prepare um branco (solvente sem corante) e soluções padrão de concentração conhecida.
2. Mantenha o mesmo recipiente, volume, fundo, iluminação, distância e orientação para branco, padrões e amostra desconhecida.
3. Capture cada solução pela câmera traseira; selecione uma região homogênea, sem reflexos, bolhas, bordas ou sombras.
4. Registre a leitura do branco.
5. Para cada padrão, informe a concentração (sempre na mesma unidade) e adicione a leitura RGB.
6. Com pelo menos dois padrões de concentrações diferentes, gere a regressão linear.
7. Analise a amostra desconhecida e estime sua concentração.

## Modelo implementado

O aplicativo usa o canal vermelho como aproximação inicial para a intensidade transmitida por uma solução de corante azul:

`A_digital = log10(R_branco / R_amostra)`

A curva é ajustada por regressão linear `A = m·C + b`; a concentração é estimada por `C = (A - b)/m`.

## Limitações científicas

- Trata-se de absorbância **digital aparente**, não de absorbância espectrofotométrica validada.
- Câmeras de celular aplicam processamento automático (exposição, balanço de branco, HDR, compressão e correção tonal). O app não bloqueia esses ajustes; portanto, a estimativa só é comparável sob condições de captura rigorosamente constantes.
- A regressão deve ser avaliada com padrões independentes e replicatas. R² alto, isoladamente, não comprova exatidão.
- A estimativa fora da faixa dos padrões é extrapolação e deve ser evitada.
- Para resultados quantitativos defensáveis, compare com um método de referência e valide linearidade, repetibilidade e incerteza.
