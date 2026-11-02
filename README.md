# ColorLab — versão 0.4

Aplicação web para leitura RGB/HSV/CIELAB de regiões de interesse em imagens,
registro de padrões com medições repetidas, cálculo de curva de calibração
por regressão linear e estimativa de concentração dentro da faixa calibrada.

## Estrutura

```text
ColorLab/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── image-processing.js   (puro — RGB, HSV, CIELAB, alertas de ROI)
│   ├── calculations.js       (puro — regressão, absorbância, repetibilidade)
│   ├── camera.js             (câmera: getUserMedia, troca frontal/traseira)
│   └── app.js                (orquestração da interface)
└── tests/
    └── run-tests.js          (testes automatizados, Node.js, sem dependências)
```

`js/image-processing.js` e `js/calculations.js` não tocam o DOM: por isso
podem ser usados tanto no navegador (via `<script>`) quanto no Node.js (via
`module.exports`), o que permite testá-los automaticamente.

## Como executar

1. Abra esta pasta no VS Code.
2. Inicie um servidor local (por exemplo, Live Server).
3. Abra o endereço servido pelo navegador.
4. Para usar a câmera, utilize HTTPS ou `localhost` e conceda a permissão solicitada.

## Como rodar os testes automatizados

Requer apenas Node.js instalado (sem `npm install`, sem dependências):

```bash
node tests/run-tests.js
```

Os testes cobrem: cor uniforme, região com cores diferentes, escala de
cinza, transparência, ROI pequena, regressão linear, R², extrapolação,
padrões duplicados e dados insuficientes (prevenção de divisão por zero).
A lógica de câmera e a orquestração de UI dependem de APIs de navegador
(`getUserMedia`, `canvas`, `localStorage`) e não são cobertas pelos testes
em Node — recomenda-se verificação manual em dispositivo real.

## Recursos da versão 0.4

- Captura pela câmera traseira **ou frontal**, com botão para alternar
  (`getUserMedia()`).
- Seleção de fotografias da galeria/arquivos, com correção de orientação
  EXIF via `createImageBitmap({ imageOrientation: 'from-image' })` (evita
  fotos de celular aparecerem giradas).
- Seleção retangular da região de interesse por mouse ou toque.
- Leitura de média, mediana, desvio padrão, HEX, HSV e CIELAB, além da
  quantidade de pixels analisados.
- Alertas automáticos quando a região selecionada tem pixels saturados
  (reflexo/estouro), pixels muito escuros (sombra), alta variação interna
  de cor (bordas, bolhas, sombra parcial) ou é pequena demais.
- Registro do branco e de padrões com concentração informada; padrões
  cadastrados com a mesma concentração são tratados como **medições
  repetidas** (faz a média e calcula o coeficiente de variação, CV%, como
  indicador de repetibilidade).
- Remoção individual de padrões, com detecção/alerta de concentrações
  duplicadas.
- Regressão linear e gráfico SVG da curva de calibração, com R².
- Estimativa de concentração, com aviso explícito quando o resultado fica
  fora da faixa calibrada (extrapolação) — nunca apresentada como medição
  confiável.
- Persistência local (branco e padrões) em `localStorage`, para retomar
  uma calibração após recarregar a página. **Nenhuma imagem é salva ou
  enviada a servidores externos** — apenas os números do branco e dos
  padrões.
- Exportação CSV das leituras, do branco, dos padrões (com repetibilidade)
  e dos parâmetros da regressão.
- Layout adaptado a telas pequenas e controles com foco visível.

## Exportação CSV

O botão **exportar CSV** fica na seção de resultado da leitura. O arquivo
inclui as leituras feitas durante a sessão atual, os padrões registrados
(com número de medições e CV% quando houver repetições) e os dados da
calibração.

## Observações científicas importantes

- Os valores RGB são medidas digitais dependentes do sensor, exposição,
  balanço de branco, iluminação, recipiente e processamento da câmera.
- HSV e CIELAB exibidos são derivados da **cor média** do ROI (não da
  média pixel a pixel de cada componente HSV/Lab), úteis para comparação
  visual entre amostras — não substituem instrumentação calibrada.
- A absorbância implementada é uma **aproximação digital exploratória**,
  calculada com o canal vermelho: `Ad = log10(R_branco / R_amostra)`. Ela
  não deve ser apresentada como absorbância espectrofotométrica validada,
  nem interpretada como confirmação da lei de Beer-Lambert sem condições
  experimentais apropriadas (fonte de luz estável, geometria fixa,
  recipiente padronizado).
- A curva só tem significado experimental quando as concentrações dos
  padrões são conhecidas e as condições de aquisição são controladas e
  mantidas entre padrões e amostra desconhecida.
- O R² descreve o ajuste linear dos pontos cadastrados; sozinho, não
  comprova exatidão, seletividade ou validade química do método, e não
  deve ser usado como único critério para escolher um modelo.
- A estimativa fora da faixa de concentração dos padrões é sinalizada como
  extrapolação e não deve ser tratada como resultado quantitativo
  confiável.

## Limitações conhecidas

- Sem testes automatizados de UI/câmera (requerem navegador real).
- HSV/CIELAB são calculados a partir da cor média, não pixel a pixel.
- A detecção de reflexo/sombra é heurística (limiares fixos), não uma
  segmentação de imagem robusta.

## Publicação

Para publicar, envie o conteúdo desta pasta ao repositório conectado à
Vercel ou substitua os arquivos correspondentes no projeto já conectado.
Confirme que `index.html`, `css/style.css`, `js/image-processing.js`,
`js/calculations.js`, `js/camera.js` e `js/app.js` mantenham esses
caminhos relativos.
