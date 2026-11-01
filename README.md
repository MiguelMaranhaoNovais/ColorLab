# ColorLab — versão 0.3

Aplicação web para leitura RGB de regiões de interesse em imagens, registro de padrões e cálculo exploratório de uma curva de calibração.

## Estrutura

```text
colorlab-atualizado/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── app.js
    └── image-processing.js
```

## Como executar

1. Abra esta pasta no VS Code.
2. Inicie um servidor local (por exemplo, Live Server).
3. Abra o endereço servido pelo navegador.
4. Para usar a câmera, utilize HTTPS ou `localhost` e conceda a permissão solicitada.

## Recursos da versão 0.3

- Captura pela câmera traseira usando `getUserMedia()`.
- Seleção de fotografias da galeria/arquivos. O input não usa o atributo `capture`, para não forçar a abertura da câmera no Android.
- Seleção retangular da região de interesse por mouse ou toque.
- Leitura da média, mediana, HEX e quantidade de pixels.
- Registro do branco e de padrões com concentração informada.
- Regressão linear e gráfico SVG da curva de calibração.
- Estimativa de concentração, com aviso quando o resultado fica fora da faixa dos padrões.
- Exportação CSV das leituras, do branco, dos padrões e dos parâmetros da regressão.
- Layout adaptado a telas pequenas e controles com foco visível.

## Exportação CSV

O botão **exportar CSV** fica na seção de resultado da leitura. O arquivo inclui as leituras feitas durante a sessão atual, os padrões registrados e os dados da calibração. Os dados permanecem apenas na memória da página; atualizar ou fechar a página reinicia a sessão.

## Observações científicas importantes

- Os valores RGB são medidas digitais dependentes do sensor, exposição, balanço de branco, iluminação, recipiente e processamento da câmera.
- A absorbância implementada é uma **aproximação digital exploratória**, calculada com o canal vermelho: `Ad = log10(R_branco / R_amostra)`. Ela não deve ser apresentada como absorbância espectrofotométrica validada.
- A curva só tem significado experimental quando as concentrações dos padrões são conhecidas e as condições de aquisição são controladas.
- O R² descreve o ajuste linear dos pontos cadastrados; sozinho, não comprova exatidão, seletividade ou validade química do método.
- A estimativa fora da faixa de concentração dos padrões é sinalizada como extrapolação e não deve ser tratada como resultado quantitativo confiável.

## Publicação

Para publicar, envie o conteúdo desta pasta ao repositório conectado à Vercel ou substitua os arquivos correspondentes no projeto já conectado. Confirme que `index.html`, `css/style.css`, `js/app.js` e `js/image-processing.js` mantenham esses caminhos relativos.
