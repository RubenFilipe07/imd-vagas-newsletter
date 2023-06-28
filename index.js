const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
const port = 443;


// app.use((req, res, next) => {
//   if (req.headers['api-key'] !== process.env.API_KEY) {
//     res.status(401).send('API key inválida');
//   } else {
//     next();
//   }
// });


const pool = new pg.Pool({
  connectionString: "postgres://postgres:123@localhost:5432/imdvagas",
});

pool.query(
  `CREATE TABLE IF NOT EXISTS editais (
    id integer PRIMARY KEY,
    titulo varchar(255) NOT NULL,
    titulo_extendido varchar(255) NOT NULL,
    link varchar(255) NOT NULL,
    prazo_inscricao varchar(255) NOT NULL,
    tipo varchar(255) NOT NULL
  )`,
  (err, res) => {
    if (err) throw err;
  }
);


app.get('/', (req, res) => res.redirect('/api'));

app.get('/api', (req, res) => {
  res.send(`
    <h1>API vagas imd</h1>
    <p>Rotas:</p>
    <ul>
        <li><a href="/api/edital/:id">/api/edital/:id</a></li>
        <li><a href="/api/editais">/api/editais</a></li>
    </ul>
    `);
});

app.get('/api/editais', async (req, res) => {
  try {
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
  
  });
    const page = await browser.newPage();
    await page.goto('https://metropoledigital.ufrn.br/portal/editais');

    const data = await page.evaluate(() => {
      const rawData = document.querySelectorAll('.box-editais-andamentos > .card > .card-body > a');

      const data = Array.from(rawData).map((d) => ({
        id: d.getAttribute('href').match(/(\d+)/g)[0],
        titulo: d.querySelector('span.text-white').innerText,
        tituloExtendido: d.querySelector('.card-title ').innerText,
        link: 'https://metropoledigital.ufrn.br' + d.getAttribute('href'),
        prazoInscricao: d.querySelector('.card-text').innerText.match(/(\d{2}\/\d{2}\/\d{4})/g)[0],
        tipo: d.querySelector('small').innerText
      }));
      return data;
    });

    await browser.close();

    res.send(data);
    saveEditais(data);

  } catch (error) {
    res.status(500).send('Erro ao obter dados dos editais');
  }
});



app.get('/api/edital/:id', async (req, res) => {
  try {
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
  
  });
    const page = await browser.newPage();
    await page.goto(`https://metropoledigital.ufrn.br/portal/visualizar/${req.params.id}`);

    const data = await page.evaluate(() => {
      const rawData = document.querySelector('.mt-4');

      const data = {
        titulo: rawData.querySelector('.titulo-noticia').innerText,
        descricao: rawData.querySelector('.conteudo-noticia').innerText,
        periodoProcesso: rawData.querySelectorAll('div.col-12.col-lg-8.px-4.pt-4 > p:nth-child(4)').innerText,
        editalSelecao: [{
          titulo: rawData.querySelector('.tb_noticias td:nth-child(2)').innerText,
          link: rawData.querySelector('.tb_noticias .text-left:nth-child(3) a').getAttribute('href'),
        }],
        editais: Array.from(rawData.querySelectorAll('.tb_noticias tr')).map((d) => ({
          titulo: d.querySelector('td:nth-child(2)').innerText,
          link: d.querySelector('.text-left:nth-child(3) a').getAttribute('href'),
        }))

      };
      return data;
    });


    await browser.close();

    res.send(data);
  } catch (error) {
    res.status(500).send('Erro ao obter dados do edital');
  }
});

const saveEditais = async (editais) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await Promise.all(editais.map(async (edital) => {
      await client.query(

        `INSERT INTO editais (id, titulo, titulo_extendido, link, prazo_inscricao, tipo)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
        titulo = $2,
        titulo_extendido = $3,
        link = $4,
        prazo_inscricao = $5,
        tipo = $6
        `,
        [edital.id, edital.titulo, edital.tituloExtendido, edital.link, edital.prazoInscricao, edital.tipo]
      );
    }));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};


const getEditaisDB = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const editais = await client.query('SELECT * FROM editais');
    await client.query('COMMIT');
    return editais.rows;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};


getEditaisCrawler = async () => {
  try {
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
  
  });
    const page = await browser.newPage();
    await page.goto('https://metropoledigital.ufrn.br/portal/editais');

    const data = await page.evaluate(() => {
      const rawData = document.querySelectorAll('.box-editais-andamentos > .card > .card-body > a');

      const data = Array.from(rawData).map((d) => ({
        id: d.getAttribute('href').match(/(\d+)/g)[0],
        titulo: d.querySelector('span.text-white').innerText,
        tituloExtendido: d.querySelector('.card-title ').innerText,
        link: 'https://metropoledigital.ufrn.br' + d.getAttribute('href'),
        prazoInscricao: d.querySelector('.card-text').innerText.match(/(\d{2}\/\d{2}\/\d{4})/g)[0],
        tipo: d.querySelector('small').innerText
      }));
      return data;
    });

    await browser.close();

    return data;
  } catch (error) {
    console.log('Erro ao obter dados dos editais');
  }
};



const comparaEditais = async () => {
  const editaisCrawler = await getEditaisCrawler();
  const editaisBanco = await getEditaisDB();
  const editaisNovos = [];

  const editaisBancoMap = {};
  editaisBanco.forEach((editalBanco) => {
    editaisBancoMap[editalBanco.id] = true;
  });

  editaisCrawler.forEach((editalCrawler) => {
    if (!editaisBancoMap.hasOwnProperty(editalCrawler.id)) {
      editaisNovos.push(editalCrawler);
      console.log(`Novo edital: ${editalCrawler.id}`);
    }
  });

  return editaisNovos;
};


const enviaEmail = async (editais) => {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.SENHA
    }
  });

  const mailOptions = {
    from: process.env.EMAIL,
    to: process.env.EMAIL_DESTINO,
    subject: '',
    html: '',
  };

  if (editais.length === 1) {
    mailOptions.subject = 'Newsletter - Nova Vaga: ' + editais[0].tipo;

    mailOptions.html = `
      <p>Uma nova vaga do IMD foi cadastrada: ${editais[0].titulo}</p>
      <h2>${editais[0].tituloExtendido}</h2>
      <p>Prazo de inscrição: ${editais[0].prazoInscricao}</p>
      <p>Tipo: ${editais[0].tipo}</p>
      <p>Confira os detalhes do edital e veja se corresponde aos requisitos. Boa sorte!</p>
      <a href="${editais[0].link}">Acessar edital</a>`;
  } else {
    mailOptions.subject = 'Newsletter - Novas Vagas';

    mailOptions.html = `
      <p>Novas vagas do IMD foram cadastradas:</p>
      ${editais.map((edital) => `
        <h2>${edital.tituloExtendido}</h2>
        <p>Prazo de inscrição: ${edital.prazoInscricao}</p>
        <p>Tipo: ${edital.tipo}</p>
        <p>Confira os detalhes do edital e veja se corresponde aos requisitos. Boa sorte!</p>
        <a href="${edital.link}">Acessar edital</a>
      `).join('')}
      `;

  }

  transporter.sendMail(mailOptions, function (error) {
    if (error) {
      console.log(error);
    }
  });
};

setInterval(async () => {
  const editaisNovos = await comparaEditais();
  if (editaisNovos.length > 0) {
    saveEditais(editaisNovos);
    enviaEmail(editaisNovos);
  }
}, 1000 * 30);



app.listen(port, () => console.log(`Rodando em http://localhost:${port}`));
