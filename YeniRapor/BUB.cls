%%%%%BİLECİK ŞEYH EDEBALİ ÜNİVERSİTESİ MÜHENDİSLİK FAKÜLTESİ%%%%%
%BİLGİSAYAR MÜHENDİSLİğİ BİTİRME ÇALIŞMASI LATEX ŞABLONU
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\def\fileversion{2.0}
\def\filedate{09/02/2025}
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{BUB}[\filedate\space Version \fileversion\space 
by Dr.Salim CEYHAN]
\DeclareOption*{%
  \PassOptionsToClass{\CurrentOption}{article}%
}
\ProcessOptions\relax
\LoadClass[a4paper,12pt]{article}
\RequirePackage{titlesec} % Başlık biçimlendirme paketi

% Bölüm başlıklarını ortala ve büyük yap
% \titleformat{\section}[block]{\centering\bfseries\large}{}{0pt}{}
\titleformat{\section}
  [block] % Blok formatında
  {\centering\bfseries\large} % Ortalanmış, kalın ve büyük harf
  {\thesection} % Otomatik bölüm numarasını ekle
  {3pt} % Numarayla başlık arasındaki boşluk
  {} % Başlık öncesi ekstra format eklenmiyor
\titlespacing{\section}{0pt}{0pt}{1pt}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage[utf8]{inputenc}
\RequirePackage[T1]{fontenc}%Türkçe harf paketi
\RequirePackage[turkish, shorthands=:!]{babel}%latex'de içindekiler,şekiller gibi 
%%başlıkları türkçeleştirir.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{times} % Matematikte ve metinde Times Roman versiyonu; 
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{tikz}
\usetikzlibrary{mindmap}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Sayfa ayarlarını yapar.
\RequirePackage[left=2.5cm,right=2.5cm,top=3cm,bottom=3cm]{geometry}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{amssymb,amsmath,amsthm}%özel matematik yazı fontları
\RequirePackage{graphics,graphicx}%grafik paketlerini çağırır
\RequirePackage{float}%Grafiğin veya resmin sayfanın istenen yerinde olmasını sağlar.
\RequirePackage{algorithm,algpseudocode}%Algoritma, pseudo code için
\RequirePackage{xurl}
\urlstyle{rm}
%% lof/lot'u Toc'a ekleme paketi%%
\RequirePackage{tocloft}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% İçindekiler başlığını ortala
% \renewcommand{\cfttoctitlefont}{\centering\Large\bfseries}
% \renewcommand{\cftaftertoctitle}{\par}
%%iÇİNDEKİLERİ BÜYÜK HARF YAPTIK
\addto\captionsturkish{\renewcommand\contentsname{\normalfont{\large\textbf{İÇİNDEKİLER}}}}
\RequirePackage{enumitem}
\setlist{noitemsep}

%% Float ayarları - sayfadaki boşlukları azaltır
\setcounter{topnumber}{3}           % Sayfa üstünde max 3 float
\setcounter{bottomnumber}{3}        % Sayfa altında max 3 float
\setcounter{totalnumber}{6}         % Sayfada toplam max 6 float
\renewcommand{\topfraction}{0.9}    % Sayfa üstünde %90'a kadar float
\renewcommand{\bottomfraction}{0.9} % Sayfa altında %90'a kadar float
\renewcommand{\textfraction}{0.1}   % Metin için min %10 yer
\renewcommand{\floatpagefraction}{0.8} % Float sayfası için min %80 dolu olmalı
\setlength{\floatsep}{8pt plus 2pt minus 2pt}           % Float'lar arası boşluk
\setlength{\textfloatsep}{10pt plus 2pt minus 2pt}      % Metin-float arası boşluk
\setlength{\intextsep}{8pt plus 2pt minus 2pt}          % Metin içi float boşluğu


%% Kod renklendirme
\RequirePackage{color}
\RequirePackage{listings}
\lstset{
    inputencoding=utf8,
    extendedchars=true,
    literate={ş}{{\c{s}}}1 {Ş}{{\c{S}}}1
             {ı}{{\i}}1 {İ}{{\.I}}1
             {ğ}{{\u{g}}}1 {Ğ}{{\u{G}}}1
             {ö}{{\"o}}1 {Ö}{{\"O}}1
             {ü}{{\"u}}1 {Ü}{{\"U}}1
             {ç}{{\c{c}}}1 {Ç}{{\c{C}}}1
}

\lstloadlanguages{C,C++,csh,Java}

\definecolor{red}{rgb}{0.6,0,0} % for strings
\definecolor{blue}{rgb}{0,0,0.6}
\definecolor{green}{rgb}{0,0.8,0}
\definecolor{cyan}{rgb}{0.0,0.6,0.6}

\lstset{
basicstyle=\footnotesize\ttfamily,
numbers=left,
numberstyle=\color{gray}\tiny,
numbersep=5pt,
tabsize=2,
extendedchars=true,
breaklines=true,
float,
stringstyle=\color{blue}\ttfamily,
showspaces=false,
showtabs=false,
xleftmargin=17pt,
framexleftmargin=17pt,
framexrightmargin=5pt,
framexbottommargin=4pt,
commentstyle=\color{green},
morecomment=[l]{//}, %use comment-line-style!
morecomment=[s]{/*}{*/}, %for multiline comments
showstringspaces=false,
morekeywords={ abstract, event, new, struct,
as, explicit, null, switch,
base, extern, object, this,
bool, false, operator, throw,
break, finally, out, true,
byte, fixed, override, try,
case, float, params, typeof,
catch, for, private, uint,
char, foreach, protected, ulong,
checked, goto, public, unchecked,
class, if, readonly, unsafe,
const, implicit, ref, ushort,
continue, in, return, using,
decimal, int, sbyte, virtual,
default, interface, sealed, volatile,
delegate, internal, short, void,
do, is, sizeof, while,
double, lock, stackalloc,
else, long, static,
enum, namespace, string},
keywordstyle=\color{cyan},
identifierstyle=\color{red},
}
\RequirePackage{caption}
\DeclareCaptionFont{white}{\color{white}}
\DeclareCaptionFormat{listing}{\colorbox{blue}{\parbox{\textwidth}{\hspace{15pt}#1#2#3}}}
\captionsetup[lstlisting]{format=listing, labelfont=white, textfont=white, singlelinecheck=false, margin=0pt, font={bf,footnotesize}}


%% Kod renklendirme

%% JavaScript için özel stil tanımı
\lstdefinestyle{JStyle}{language=Java,
tabsize = 4,
showstringspaces = false,
numbers = left,
commentstyle = \color{green},
keywordstyle = \color{blue},
stringstyle = \color{red},
rulecolor = \color{black},
basicstyle = \small \ttfamily,
breaklines = true,
columns=fullflexible,
numberstyle = \tiny,
literate=%
   {Ö}{{\"O}}1
   {Ü}{{\"U}}1
   {ü}{{\"u}}1
   {ö}{{\"o}}1
   {ı}{{\i}}1
   {İ}{{\.{I}}}1
   {ğ}{{\u{g}}}1
   {Ğ}{{\u{G}}}1
   {ş}{{\c{s}}}1
   {Ş}{{\c{S}}}1
   {ç}{{\c{c}}}1
   {Ç}{{\c{C}}}1
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%şekil, tablo ve denklem numaralarını bölümlere göre numaralar
\RequirePackage{xurl}
\RequirePackage{caption}
\numberwithin{equation}{section}
\numberwithin{figure}{section}
\numberwithin{table}{section}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\renewcommand{\cftfigfont}{Şekil\;}
\renewcommand{\cfttabfont}{Tablo\;}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{cite}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{datetime}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{multirow}%Tablolar için özel komutları çağırır.
\RequirePackage{setspace}%satır boşlukları için özel komutları çağırır
\RequirePackage{longtable}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{indentfirst}
\RequirePackage{parskip}
\setlength{\parindent}{0.5cm}%paragraf girintisi
\renewcommand{\baselinestretch}{1.5}
%Tüm metnin satır aralıklarını 1.5 aralık yapar.
\setlength{\parskip}{\baselineskip}
%%%%%%%%%%%%%%%Filigran Ekleme%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%Yalnız ilk sayfaya Filigran koyan kod.(*-dan dolayı yalnız 
%%ilk sayfaya ekledi)%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% \RequirePackage{eso-pic}

% \AddToShipoutPicture*{%
% \scalebox{1.3}
% {\put(0,-150)
% {\includegraphics[height=297mm,width=210mm]{filigran}}}}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{totpages}%
%Metnin toplam print edilecek sayfa sayısını verir.
\RequirePackage{verbatim}
\flushbottom%
% tüm metin sayfalarının aynı yükseklikte olmasını sağlar.
\RequirePackage[pdftex, unicode, linktoc=all, hidelinks, breaklinks]{hyperref}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\urlstyle{same}

