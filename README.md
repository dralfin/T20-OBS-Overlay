# T20 OBS Overlay

Módulo para **Foundry VTT v13** + sistema **Tormenta20**. Mostra **Vida (PV), Mana (PM) e Defesa** de até 5 personagens em **duas telas** do OBS, numa faixa fina no estilo da HUD "Séquito do Ascendente Rubro".

**Como funciona (sem login no OBS):** o navegador do **mestre** (já logado no Foundry) envia os dados ao OBS pelo **obs-websocket** (já incluso no OBS 28+). O OBS mostra uma página local, `overlay/t20-overlay.html`, que só recebe esses dados. Não existe usuário, senha ou sessão do Foundry no OBS.

## Instalação

1. Extraia a pasta `t20-obs-overlay` em `Data/modules/` do Foundry e reinicie.
2. Ative o módulo no mundo.

## 1) No Foundry (mestre)

*Configurações → Configurar Módulos → T20 OBS Overlay*:

- **Configurar personagens**: escolha o personagem de cada um dos 5 slots (1 e 2 = painéis de cima, 3, 4 e 5 = painéis de baixo; na tela 2 vão da esquerda para a direita). Há um botão que preenche com os personagens dos jogadores.
- **Quem envia os dados ao OBS** (dentro de *Configurar personagens*): por padrão é o mestre, mas você pode escolher outro usuário (por exemplo, o jogador que roda o OBS na stream). Esse usuário abre o Foundry, liga *Enviar dados ao OBS* nas configurações dele e precisa ser **Observador** dos personagens dos slots (senão não lê PV/PM). Se ele estiver offline, o mestre assume.
- **Cena(s) do OBS da Tela 1 / Tela 2**: nomes das cenas do OBS (ex.: `Séquito` e `Jogo`). Pode listar vários separados por vírgula; basta o nome da cena conter o texto, sem diferenciar maiúsculas nem acentos.
- **Mostrar efeitos ativos (condições)**: opcional (desligado). Mostra uma etiqueta com o nome de cada condição/efeito nativo do Tormenta20 ativo (os aplicados como status, ex.: Abalado), abaixo da faixa. Teste com `?teste=1&efeitos=1`.
- **Mostrar o nome do personagem**: opcional (desligado por padrão).
- **Enviar dados ao OBS**: ligue (é uma opção só do seu navegador). Preencha endereço (`localhost` se o OBS roda no mesmo computador), porta (`4455`) e a senha do WebSocket, se houver.

## 2) No OBS

1. **Ferramentas → Configurações do Servidor WebSocket** → marque *Ativar servidor WebSocket* (porta 4455). A senha é opcional; se usar, coloque a mesma no Foundry.
2. Adicione uma **Fonte de Navegador** (1920×1080), em **todas as cenas** em que o overlay deve aparecer (use a mesma fonte como referência), de duas formas possíveis:
   - **Arquivo local:** marque *Arquivo local* e escolha `Data/modules/t20-obs-overlay/overlay/t20-overlay.html` (se o OBS roda no mesmo computador do Foundry), **ou**
   - **URL:** `http://SEU-FOUNDRY:30000/modules/t20-obs-overlay/overlay/t20-overlay.html` (arquivos de módulo são servidos sem login).
3. Pronto: ao trocar de cena no OBS, a tela troca sozinha (Tela 1, Tela 2 ou vazio). Em cenas que não estejam na lista, o overlay fica vazio e transparente.

Deixe o navegador do mestre com o Foundry aberto durante a sessão. Os dados são reenviados a cada 5 segundos, então fechar e abrir o OBS não exige nada. Se o Foundry ficar fechado por mais de 1 minuto, o overlay se esconde sozinho (para não mostrar números velhos).

### Dicas e testes

- Adicione `?debug=1` ao final da URL (ou do nome do arquivo) para ver um texto de estado no canto: se os dados estão chegando e qual cena/tela está ativa.
- `?tela=1` ou `?tela=2` força uma tela, ignorando a cena.
- Se o Foundry roda em **https** e o OBS em **outro computador**, o navegador pode bloquear a conexão `ws://` com o OBS. O caminho mais simples é rodar o OBS no mesmo computador do navegador do mestre (`localhost`).
- Só o mestre ativo envia dados (se houver mais de um GM conectado, não duplica).

## Modo antigo (com login, opcional)

Ainda existe a opção de abrir o próprio Foundry dentro do OBS (`http://SEU-FOUNDRY:30000/game?t20obs=auto`, `tela1` ou `tela2`), mas exige login e usuário com permissão de Observador. Para testar no seu navegador: *Tela do overlay* nas configurações, ou `Ctrl+Shift+O`.

## Posição, tamanho e fonte (sliders)

*Configurações → Configurar Módulos → T20 OBS Overlay → **Ajustar posição e largura***. Escolha a **Tela 1** ou a **Tela 2**:

- **Blocos (um por personagem):** Posição X, Posição Y e Largura de cada um dos 5 blocos, com uma miniatura mostrando onde ficam.
- **Elementos (valem para os 5 blocos da tela):**
  - **Vida (PV)**, **Mana (PM)** e **Defesa (armadura)**: Largura, Altura e Tamanho da fonte, cada um separado. Largura `0` = automática (os elementos automáticos dividem o espaço que sobra; por exemplo, estreitar a Defesa deixa a Vida e a Mana mais largas).
  - **Nome**: tamanho da fonte.
- **Fontes (valem para as duas telas):** uma para os números e outra para o nome. Cada uma aceita:
  - **Arquivo de fonte** (`.ttf`, `.otf`, `.woff`, `.woff2`): clique em **Arquivo…** e escolha o arquivo no seletor do Foundry (para enviar um arquivo novo, use o botão de upload do próprio seletor, por exemplo para uma pasta `assets/fonts`). O arquivo vai **embutido nos dados enviados ao OBS**: não precisa instalar nada no computador do OBS nem ter internet, e funciona com a página em arquivo local ou por URL. Limite de 2 MB por arquivo (prefira `.woff2`, que é bem menor).
  - **Nome da fonte**: de uma fonte instalada no computador do OBS ou do Google Fonts (ex.: `Cinzel`; Google Fonts precisa de internet na máquina do OBS).
  - Se houver arquivo, ele tem prioridade; o nome digitado serve de reserva. Vazio nos dois = fonte padrão.
  - A página do overlay guarda uma cópia da fonte no navegador do OBS, então ao recarregar ela volta na hora (o Foundry também reenvia a cada 30 s).
  - Respeite a licença da fonte que usar.
- Tudo é salvo sozinho e **aparece ao vivo no OBS** enquanto você arrasta. Os ajustes ficam salvos no mundo.
- *Restaurar padrão desta tela* volta blocos e elementos da tela aos valores originais (as fontes não mudam; para voltar ao padrão, remova o arquivo com o ✕ e apague o nome).

## Chat no OBS

*Configurações → Configurar Módulos → T20 OBS Overlay*, opções **Chat no OBS**:

- **mostrar**: liga o chat no overlay (desligado por padrão). Aparecem as mensagens **públicas** do chat do Foundry: falas e rolagens (nome de quem falou/rolou, descrição e total). **Sussurros e rolagens cegas nunca são enviados.**
- **aparência**: *Do jeito do Foundry* (padrão) ou *Simples*. No modo Foundry, cada mensagem é renderizada pelo próprio Foundry (cartas de ataque/magia, rolagens com fórmula e dados, imagens) e o overlay as mostra dentro de uma caixa isolada que carrega o **visual (CSS) do próprio Foundry**, como um recorte do chat. O **CSS inteiro do Foundry** (incluindo o do sistema e dos módulos) é enviado ao OBS junto, uma vez ao conectar e a cada 30 s, e a página o guarda; assim o chat não depende de o OBS baixar os estilos. Imagens e fontes do chat ainda vêm do endereço do Foundry, então o OBS precisa conseguir abri-lo (sem login). Se o chat sair sem estilo, atualize o Foundry (F5) para reenviar o CSS e "Atualizar cache" no OBS. A altura da caixa tem opção própria; o texto cresce de baixo para cima.
- **Tela do Chat** (cena própria só com o chat): preencha **Cena(s) do OBS da Tela do Chat** (ex.: `Chat`) e crie essa cena no OBS com a mesma fonte de navegador. Nela aparece só o chat, sem os personagens, com posição/tamanho próprios (**Tela do Chat: posição X, Y, largura, altura**). Se não quiser o chat nas Telas 1 e 2, escolha *Nenhuma delas* em **em quais telas**. `?tela=chat` força essa tela.
- **Chat como fonte separada (para usar nas Telas 1 e 2 e posicionar livremente no OBS):** adicione uma **segunda Fonte de Navegador** com a mesma página e `?tela=chat` no fim da URL (ou do nome do arquivo). Nesse modo o chat **ocupa a fonte inteira**, sem escala: o tamanho da fonte de navegador no OBS é o tamanho da caixa de chat, e você a move/redimensiona direto no OBS, em quantas cenas quiser. Ela aparece sempre que a fonte estiver visível (não depende do nome da cena). Para não duplicar, deixe a fonte principal sem chat: em **em quais telas**, escolha *Nenhuma delas*.
- **só rolagens de dados**: oculta as conversas e mostra apenas rolagens.
- **em quais telas**: Tela 1, Tela 2 ou as duas.
- **quantas mensagens** (1 a 15), **some após (segundos)** (0 = não some), **posição X / Y** (Y é a borda de baixo da caixa; tela de 1920×1080), **largura** e **tamanho da fonte**.
- As mensagens novas entram com uma animação curta e somem sozinhas depois do tempo escolhido. Ao abrir o OBS no meio da sessão, só aparecem as mensagens mais recentes (dentro do tempo).
- Cartas de ataque/magia do sistema entram como texto simples (cortado em 200 caracteres).
- Teste sem o Foundry: `?teste=1&chat=1`.

## Chat em janela (cópia do seu chat)

Qualquer usuário (não só o mestre) pode abrir uma **janela com uma cópia do próprio chat**, só com o que ele pode ver (inclui sussurros destinados a ele), com o visual do Foundry, atualizando ao vivo e rolando até a última mensagem:

- *Configurações → Configurar Módulos → T20 OBS Overlay → **Abrir cópia do chat***, ou
- atalho **Ctrl+Shift+C** (editável em *Configurar Controles*).
- Abre como **janela separada do navegador**, com a **mesma largura do chat do Foundry** (medida na barra lateral; você ainda pode redimensionar), (fora do Foundry), que você pode mover para outro monitor e redimensionar à vontade; ela fecha junto com o Foundry. Se o navegador bloquear pop-ups, permita para o site do Foundry (nesse caso o módulo abre a cópia dentro do Foundry, como plano B). Para usar no OBS, adicione uma *Captura de Janela* dessa janela. Para a versão que não precisa de captura, use o **Chat no OBS** acima.
- **Abrir sozinha para um jogador:** em *Configurar personagens*, o mestre escolhe **Abrir a janela do chat automaticamente para** um usuário. Quando ele entrar (ou quando o mestre salvar a escolha com ele já online), a janela tenta abrir sozinha. Navegadores só permitem pop-up após um clique, então, se bloquear, aparece o aviso "clique em qualquer lugar" e a janela abre no primeiro clique/tecla do jogador. Para abrir sem clique, o jogador permite pop-ups para o site do Foundry (ícone de pop-up bloqueado na barra de endereço → *Sempre permitir*).
- **Rolagem:** a barra de rolagem fica invisível (a roda do mouse e o toque continuam rolando). Quando chega uma mensagem nova, a janela pula para o fim; se a mensagem for maior que a janela, ela começa no topo da mensagem e desce devagar (cerca de 90 px por segundo) até o fim. Se você rolar na mão, a descida lenta para.
- Opção **Chat em janela: quantas mensagens** (padrão 60). Os botões das cartas e a expansão dos dados não funcionam na cópia (é só leitura).

## Animações

As barras animam sozinhas quando o valor muda:

- **Perda de PV/PM:** a barra cai rápido, um rastro claro mostra o que foi perdido e vai encolhendo, a barra pisca (e balança no PV) e o valor `-12` sobe flutuando.
- **Ganho:** um brilho verde (azul no PM) avança na frente e a barra o alcança, com `+8` flutuando.
- Os números **contam** até o novo valor; a Defesa dá um "pulso" quando muda.
- **PV/PM temporário:** o número aparece sobre o coração/escudo azul. Ao ganhar, ele "estoura" na tela; ao perder, aparece um anel dourado no ícone, o número treme e se desfaz (e `-N` dourado sobe). No `?teste=1` há exemplos.
- PV abaixo de 25% fica pulsando suavemente.
- O reenvio periódico dos dados não dispara animação; só mudanças reais.

As animações ficam em `scripts/render.js` (`patchBar`) e `styles/overlay.css` (seção "Animações das barras"). Depois de editar, rode `python3 tools/build-overlay.py`.

## A animação não aparece? Passo a passo

1. **Atualize a página no OBS.** O OBS guarda a página em cache. Depois de trocar os arquivos do módulo, abra as propriedades da Fonte de Navegador e clique em **Atualizar cache da página atual**. No navegador do mestre, dê F5 no Foundry.
2. **Confira a versão.** Acrescente `?debug=1` ao final da URL (ou do nome do arquivo). O texto no canto deve começar com `v3.1.1` (ou mais nova).
3. **Veja a demonstração.** Use `?teste=1&tela=1` (ou `tela=2`). A cada 2,5 s a página simula dano, cura, gasto de mana e mudança de Defesa, sem depender do Foundry. Se animar aqui, o visual está certo no seu OBS.
4. **Teste com dados reais.** Com `?debug=1`, mude o PV de um personagem no Foundry e veja o contador **animações disparadas**:
   - sobe, mas nada aparece na tela → problema de renderização no OBS;
   - não sobe, mas o número muda → os dados chegam sem que o módulo veja a mudança;
   - nem o número muda → os dados não estão chegando (confira *Enviar dados ao OBS* e a conexão).

Animações só rodam com a cena visível: uma mudança de PV que ocorre enquanto a cena do overlay está escondida não aparece depois.

## Ajustar visual

- Posições, larguras, alturas e fontes: use o menu de sliders acima. Os valores padrão (usados ao restaurar) estão em `GEOMETRY` e `DEFAULT_ELEMS`, em `scripts/render.js`.
- Tamanhos e cores: `styles/overlay.css`.
- Depois de editar um desses arquivos, gere a página de novo: `python3 tools/build-overlay.py` (atualiza `overlay/t20-overlay.html`).

Por padrão o nome usa a fonte **Pirata One** (Google Fonts); sem internet cai numa serifada. Com um arquivo de fonte no menu, não depende de internet.

## Sistemas suportados

- **Tormenta20**: PV, PM e Defesa, como descrito abaixo.
- **D&D 5e** (`dnd5e`): **PV** = pontos de vida (já com PV máximo efetivo e temporários), **Mana** = **espaços de magia** (soma de todos os níveis mais os de pacto; a barra mostra restantes/totais), **Defesa** = **CA**. Personagens sem espaços de magia (guerreiro, bárbaro...) ficam sem a barra azul, e as outras barras ocupam o espaço. Condições (Cego, Envenenado...) aparecem como etiquetas, com o nome que o sistema usa.
- **Outros sistemas:** o módulo tenta os nomes comuns (`attributes.hp`/`pv`, `mp`/`pm`, `ac`/`defesa`); sem mana, a barra azul some. Se os valores vierem zerados, ajuste `readStats` em `scripts/common.js`.

## Dados lidos (Tormenta20)

`system.attributes.pv`, `system.attributes.pm` (valor, máximo, temporário) e `system.attributes.defesa.value`. Se a sua versão do sistema usar outros caminhos, ajuste `readStats` em `scripts/common.js` (veja os valores com `game.actors.getName("Nome").system.attributes` no console, F12).
