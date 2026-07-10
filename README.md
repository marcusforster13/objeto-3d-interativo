# Objeto 3D Interativo — Three.js

Site com o seu modelo 3D: gira com o dedo/mouse, e ao tocar em peças específicas
(portas, cano, rodas) toca a animação correspondente.

## O que já está pronto

- **Tela de intro** com a logo (`public/logo.png`), barra de progresso de carregamento e botão
  "Toque para começar" — o usuário só entra na cena 3D depois de tocar, o que também garante
  que o navegador reconheça uma interação real do usuário (bom pra telas touch/TVs).
- Modelo carregado de `public/models/objeto.glb`
- Rotação por touch/mouse (`OrbitControls`) — um dedo gira, dois dedos dá zoom/pan
- Toque nas peças abaixo aciona a animação certa:

| Peça (mesh) | Animação | Comportamento |
|---|---|---|
| `PortaBateria_Mesh` | `PortaBateria_Abrir` | Toggle: 1º toque abre, 2º fecha |
| `PortaEnergia_Mesh` | `PortaEnergia_Abrir` | Toggle: 1º toque abre, 2º fecha |
| `CanoParte1_Mesh` | `Cano_Subir_Parte1` | Toggle: 1º toque sobe, 2º toque desce voltando ao estado inicial |
| `CanoParte2_Mesh` | `Cano_Subir_Parte2` | Toggle: 1º toque sobe, 2º toque desce voltando ao estado inicial |
| `RodaEsquerda_Mesh` **ou** `RodaDireita_Mesh` | `Roda_Girar` + `roda_giraresquerda` (as duas juntas) | Toggle: 1º toque gira pra frente, 2º toque gira ao contrário voltando ao estado inicial |

> **Nota sobre os nomes das rodas**: no arquivo `.glb`, as animações `roda_giraresquerda`
> e `Roda_Girar` estão com nomes trocados/inconsistentes em relação ao lado real
> (isso não afeta o funcionamento — o código mapeia pelo objeto certo, não pelo texto do nome).
> Se um dia quiser deixar os nomes bonitos no Blender, é só renomear as Actions lá
> e trocar os nomes na lista `clips` dentro de `src/main.js` (seção `INTERACTIONS`).

## Como rodar localmente

Requer [Node.js](https://nodejs.org) instalado (versão 18 ou mais recente).

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` no navegador. Pra testar o touch de verdade, abre esse
mesmo endereço no celular (precisa estar na mesma rede Wi-Fi) usando o IP do
computador, ex: `http://192.168.0.10:5173` — o terminal do `npm run dev` mostra
esse endereço de rede.

## Como publicar (GitHub + Vercel)

### 1. Subir pro GitHub

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

(Cria o repositório vazio no GitHub antes, em github.com/new)

### 2. Conectar na Vercel

1. Entra em [vercel.com](https://vercel.com) e loga com sua conta GitHub.
2. Clica em **Add New → Project**.
3. Seleciona o repositório que você acabou de subir.
4. A Vercel detecta automaticamente que é um projeto Vite — não precisa mudar nada,
   só clica em **Deploy**.
5. Pronto — toda vez que você der `git push`, ela atualiza o site sozinha.

## Adicionar mais peças/animações depois

Se você animar mais peças no Blender no futuro (seguindo o mesmo padrão de nomes
que já vinha usando), é só abrir `src/main.js` e adicionar uma entrada nova dentro
do objeto `INTERACTIONS`, no topo do arquivo:

```js
NovaPeca_Mesh: {
  type: 'toggle', // ou 'once' ou 'spin-toggle'
  clips: ['NovaPeca_Abrir'],
  label: 'Nova peça'
}
```

Depois, troca o arquivo `public/models/objeto.glb` pela versão nova exportada
do Blender (mesmo nome de arquivo) e roda `npm run dev` de novo pra testar.

## Trocar a logo da tela de intro

É só substituir o arquivo `public/logo.png` por outra imagem (mesmo nome de arquivo,
ou troca o caminho no `<img src="...">` dentro de `index.html`).

## Cenário

O cenário (`public/models/cenario.glb`) é carregado junto com o objeto principal,
na posição absoluta em que foi modelado no Blender — não precisa de ajuste manual
de posição/escala, desde que ele tenha sido montado no mesmo arquivo Blender do
objeto original.

As peças do cenário com material **emissivo** (as "luzes") brilham automaticamente
com efeito de **bloom** — isso é detectado sozinho pelo código, olhando os materiais
do arquivo exportado. Se você adicionar mais luzes no Blender, só precisa marcar o
material delas com uma cor emissiva (e, se quiser mais brilho, usar a opção
"Emission Strength" no shader) — não precisa mexer no código do site.

Pra ajustar a intensidade do brilho, abre `src/main.js` e procura por `UnrealBloomPass`:

```js
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.1, // strength -> aumenta pra brilhar mais forte
  0.5, // radius -> aumenta pra espalhar mais o brilho
  0.15 // threshold -> diminui pra mais coisas brilharem, aumenta pra só o mais claro brilhar
);
```

## Painel de informação institucional

Ao tocar em qualquer peça, um painel aparece no rodapé da tela com um título e uma
descrição curta (ex: "Painel Solar — Painéis responsáveis pela captação de energia solar...").
Ele some sozinho depois de alguns segundos, ou pode ser fechado no X.

Pra editar os textos, abre `src/main.js` e altera os campos `title` e `description`
de cada peça dentro do objeto `INTERACTIONS`, no topo do arquivo:

```js
PortaBateria: {
  ...
  title: 'Bateria',
  description: 'Seu texto institucional aqui.'
}
```

## Estrutura do projeto

```
projeto3d/
├── index.html          # HTML principal
├── package.json
├── vite.config.js
├── public/
│   └── models/
│       └── objeto.glb  # seu modelo 3D exportado do Blender
├── src/
│   ├── main.js          # toda a lógica: câmera, luzes, raycaster, animações
│   └── style.css         # estilo da tela de loading e dicas na tela
```
