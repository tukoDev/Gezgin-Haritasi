import mysql from 'mysql2';

export const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'gezgin'
});

db.connect(err => {
  if (err) {
    console.error('Veritabanı bağlantı hatası:', err);
  } else {
    console.log('MySQL bağlantısı başarılı!');
  }
});
