### MANUAL DE API´S.


**Contenido**
................................................................................................................................................................................... 0


**INTRODUCCIÓN** **2**


**ESTRUCTURA DE LA TABLA SIST_API** **5**


**EN LA BASE DE DATOS** **5**


**ESTRUCTURA DE LA TABLA EN LA BASE DE DATOS (BDD)** **6**


**DETALLE DEL PROCESO** **8**


**DETALLE DEL PROCESO** **9**


**APIs PROVEEDORES** **11**


**CREACIÓN Y ACTUALIZACIÓN DE PROVEEDORES** **12**


**CREACIÓN DE SOLICITUDES DE REQUISICIONES** **16**


**CREACIÓN Y ACTUALIZACIÓN DE ÓRDENES DE COMPRAS** **21**


**CREACIÓN FACTURAS DE PROVEEDORES** **25**


**APIs INVENTARIOS** **29**


**CREACIÓN Y ACTUALIZACIÓN DE PRODUCTOS** **30**


**AJUSTE DE INVENTARIO (MA / TE / TI)** **39**


**RECEPCIÓN DE INVENTARIO** **50**


**CREACIÓN DE SOLICITUD DE TRASPASOS** **58**


**CREACIÓN Y ACTUALIZACIÓN DE PRECIOS** **64**


**APIs PRODUCCIÓN** **64**


**CREACIÓN DE ÓRDENES DE PRODUCCIÓN** **65**


**APIs CLIENTES** **72**


**CREACIÓN Y ACTUALIZACIÓN DE CLIENTES** **73**


**CREACIÓN Y ACTUALIZACIÓN DE SUBCLIENTES** **80**


**CREACIÓN DE COTIZACIONES** **83**


**CREACIÓN DE PEDIDOS DE CLIENTES** **86**


**CREACIÓN DE REMISIONES CONFIRMADAS** **91**


**CREACIÓN DE FACTURAS DE CLIENTES CONFIRMADAS O VER / EDITAR** **98**


**CREACIÓN DE FACTURAS DE CLIENTES / COMERCIO EXTERIOR / MÉXICO** **108**


**CREACIÓN DE COBROS DE CLIENTES** **121**


**NOTAS DE CRÉDITO / DÉBITO** **125**


**TESORERÍA Y BANCOS** **124**


**CHEQUES MANUALES** **125**


**DEPÓSITOS OTROS** **127**


Lleva Tu Empresa Al **1**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**CONTABILIDAD** **131**


**CONTABILIDAD** **132**


**ANEXOS** **134**


**ANEXOS** **135**


Lleva Tu Empresa Al **2**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# INTRODUCCIÓN

##### Manual de API’s


Una **API** es una interfaz de programación de aplicaciones. Expliquemos cada uno de estos términos para
comprender mejor:

**Aplicación** : Una aplicación es un servicio al que puede acceder un humano o un programa informático.

**Programación** : Un programa es un conjunto de funciones informáticas escritas por un desarrollador que realiza
tareas en su lugar.

**Interfaz** : Una interfaz hace la conexión entre dos cosas, en nuestro caso, entre una aplicación Externa y MBA3. El
motor de API define lo que el programa externo puede solicitar a la aplicación MBA3, transmite las solicitudes del
programa a la aplicación y las respuestas de la aplicación al programa.
La integración de Sistemas representa un desafío continuo para las organizaciones. Las Innovaciones en la
tecnología avanzan muy rápidamente, rebasando el tiempo útil de las inversiones que hacemos en éstas. Como
consecuencia de estas innovaciones, nuestros ambientes se vuelven heterogéneos. Por lo que, ante tal desafío,
ponemos a disposición la forma de interactuar información de aplicaciones externas con nuestros Productos de
Software.


Toda la Comunicación se realiza a partir de las aplicaciones externas hacia MBA3, a través de 2 opciones:


Para consultas únicamente se realizan operaciones directas hacia la Base de Datos vía ODBC


Para integrar datos hacia MBA3, es obligatorio pasar por el Motor de APIS para su validación.


Lleva Tu Empresa Al **3**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Este documento pretende mostrar los pasos que se deben seguir y la estructura que se tiene que construir para
el ingreso de la información proveniente de movimientos de Clientes, Pedidos, Facturas, Cobros, Hojas de Rutas,
Notas de Débito / Crédito, Contabilidad, Recepción de Inventario, Depósitos Otros y Cheques Manuales, desde
una fuente externa.


El sistema presenta la información que genera, para que las aplicaciones EXTERNAS la puedan utilizar en sus
procesos de actualización de registros.


Se debe tener en cuenta que para manejar los procesos API's, el cliente tiene que realizar un desarrollo extra para
interactuar con el Producto de Software MBA3 ERP, a través de Web Services o ODBC y grabar la información que
se necesita dependiendo del proceso que desea aplicar (Creación de clientes, Facturas, etc.) y dejarlo en el
repositorio mencionado en este documento (tabla: SIST_API), siguiendo las reglas y en el orden descrito en este
manual. La herramienta que utilice queda a disposición y experiencia de nuestros clientes. Como ejemplo se
describe en el “Anexo D” una conexión vía ODBC al Producto de Software MBA3 colocando información de
Clientes en la tabla “SIST_API” y ejecutándolo a través del “Monitor de Servicios”.


**Nota 1** : En caso de manejar los APIs con una conexión externa ODBC (Ver ANEXO A)


**Nota 2** : Se necesita configurar y ejecutar Servidor Servicios (Ver ANEXO B)


**Nota 3** : En caso de manejar los APIs con Web Services (Ver ANEXO E)


**Nota 4: ACTUALIZACIONES** . - La actualización de este documento y del Producto de Software MBA3 en relación a
versiones anteriores, no implica que los procesos desarrollados de APIs anteriores se desechen, sino más bien es
un incremento a la funcionalidad existente.


Lleva Tu Empresa Al **4**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


## ESTRUCTURA DE LA TABLA SIST_API EN LA BASE DE DATOS

##### Manual de API’s


ESTRUCTURA DE LA TABLA EN LA BASE DE DATOS (BDD)


En el diseño de la estructura de Datos del Producto de Software que posee MBA3, se encuentran creados el
servidor de Web Services y la tabla **SIST_API;** La estructura de los campos es la misma si se accede con Web
Services o con ODBC, y es la siguiente:







|Campo|Tipo|Tamaño|Datos|
|---|---|---|---|
|CODE_s|Alfanumérico|5|Código de operación en procesos de ENTRADA/Salida de<br>Información al Sistema|
|CORP_s|Alfanumérico|5|Código de la empresa sobre la cual se realizará la<br>operación correspondiente.|
|GROUP_CATEGORY_s|Alfanumérico|5|Categoría:<br>• <br>Si la información es deENTRADA al SISTEMA,<br>utilizaremos el código:API<br>• <br>Si la información es deSALIDA del SISTEMA,<br>utilizaremos el código:APIOT|
|INTEGER_1|Integer||Estado actual del registro, que por defecto tendrá el valor<br>de:1.<br>0 si fue procesado satisfactoriamente y otro valor si se<br>procesó con ERROR; dependiendo del error se asignará su<br>correspondiente.|
|INTEGER_3|Integer||Campo que indica que el API es llenado a través del<br>monitor de PDA:<br>• <br>0: conexión a través de Web Services o ODBC<br>• <br>1: conexión a través del Monitor de Comunicaciones<br>• <br>3: Información generada en el mismo sistema como<br>de salida|
|LONGINT_1|Longint||Número Secuencial de cada registro en SIST_API, sirve<br>para consultar el estado del proceso.|
|LONGINT_2|Longint||Fecha y hora de Ingreso en formato entero largo. (Ref.<br>TimeStamp VB.)|
|TEXTO1_10|Alfanumérico|10|Código del usuario, identifica el usuario que crea el<br>registro en la BDD. Dato que debe estar registrado en la<br>BDD.|
|TEXTO1_24|Alfanumérico|24|IP de la máquina o dispositivo que se conecta a la BDD|
|TEXTO1_X|Text||Mensaje de Error en el proceso de almacenamiento del<br>registro.|
|TEXTO2_X|Text||Campo utilizado para almacenar datos deCabecera, tales<br>como Pedidos, Factura, Cobros.|
|TEXTO3_X|Text||Campo utilizado para almacenar datos deDetalle, por<br>ejemplo, Pedidos, Facturas, Cobros, otros.|


Lleva Tu Empresa Al **6**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|Campo|Tipo|Tamaño|Datos|
|---|---|---|---|
|TEXTO4_X|Text||Campo utilizado para almacenar datos deDetalle de<br>cuotas, Forma de Pago y otros.|
|TEXTO7_X|Text||Campo utilizado para almacenar datos deInformación<br>Adicional de Documento (Fact.)|
|Opcion_i|Integer||Campo que almacena por defecto0 y dependiendo de la<br>operación variará esta información.|
|IDConsulta_s|Alfanumérico|50|Campo destinado para almacenar un identificador del<br>registro,<br>desde<br>aplicaciones<br>externas,<br>que<br>necesariamente debe ser única.|
|NumDoc_s|Alfanumérico|60|Número del Documento al que hace referencia en la<br>operación, manejado dentro del LOG de APIs.|
|Origin|Alfanumérico|3|Campo que almacena el código de la sucursal donde se<br>creó la información|
|Local_Destino|Alfanumérico|3|Campo que almacena el código de la sucursal en la cual se<br>ejecutará esta operación.|
|Local_Origen|Alfanumérico|3|Campo que almacena el código de la sucursal donde se<br>creó la información|
|Resultado_Respuesta|Alfanumérico|20|Campo que almacena el número secuencial creado por<br>MBA en Ajustes de Inventario (MA/TE/TI).|


Web Services:


Para el correcto acceso de los Web Services se requiere indicar en primer lugar el CORP_s y el campo ap_pass de
Password (ver anexo E) por ejemplo así:


www.miempresa.com:8080/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678


NOTA: El código de la empresa y el password de acceso Web se especifica en la configuración de MBA3, ruta:
Administración del Sistema - Parámetros Empresa, ver anexo E para más información y ejemplos


Lleva Tu Empresa Al **7**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


## DETALLE DEL PROCESO

##### Manual de API’s


DETALLE DEL PROCESO


En el **Web Services**    - la tabla **SIST_API**, dependiendo del tipo de conexión, se requiere llenar algunos campos que


son necesarios sus datos, ya que afectarán el registro de la transacción y otros que se enviaran a los procesos


respectivos con la validación correspondiente; tales campos afectaran al registro de datos, tenemos:


**Código de operación en procesos de ENTRADA de Información al Sistema** :


**01:** Código que permite identificar el proceso de Pedidos.


**02:** Código que permite identificar el proceso de Cobros.


**04:** Código que permite identificar el proceso de ingreso de Facturas.


**05:** Código que permite identificar el proceso de ingreso y actualización de Clientes.


**08:** Código que permite identificar el proceso de ingresos de transacciones Contables.


**09:** Código que permite identificar el ingreso de Depósitos Otros.


**10:** Código que permite identificar la operación Notas de Débito y Crédito.


**12:** Generar Ajuste Inventario y Transferencias de Egreso e Ingreso


**14:** Código que identifica a las facturas de proveedores


**16:** Código de la operación para crear o actualizar Productos


**17:** Código que permite anular una factura de clientes


**18:** Código que permite crear o actualizar una Orden de Compra


**19:** Código que permite crear o actualizar datos de Proveedor


**20:** Código que identifica la operación Recepción de Inventario


**21:** Código que identifica la operación Creación Cheques Manuales


**22:** Código que identifica la operación Creación de Remisiones


**25:** Código que identifica la operación Ordenes de Producción


**26:** Código que identifica la operación de ingreso y actualización de SubClientes


**27:** Código que identifica la operación de Facturas Comercio Exterior – México


**29:** Código que permite identificar el proceso de Cotizaciones.


Lleva Tu Empresa Al **9**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Código de operación en procesos de SALIDA de Información a los Sistemas Externos,**


**En Todos los Documentos de Transacción los APIOUT se crean en el Proceso de Confirmación.**


**105 -** Api de Salida - Ficha de Clientes.


**116 -** Api de Salida - Ficha de Productos


**119 -** Api de Salida - Ficha de Proveedores


-----------------------------------------------------------------------------------------

**112 -** Api de Salida - Ajustes Manuales de Inventario


----------------------------------------------------------------------------------------

**101 -** Api de Salida - Clientes Pedidos Confirmados


**122 -** Api de Salida - Clientes Remisiones Confirmadas


**104 -** Api de Salida - Clientes Facturas Confirmadas


----------------------------------------------------------------------------------------

**118 -** Api de Salida - Proveedores Órdenes de Compra Confirmados


----------------------------------------------------------------------------------------

**120 -** Api de Salida Recepción de Inventario Facturas


**120 -** Api de Salida Recepción de Inventario Órdenes de Compra


**120 -** Api de Salida Recepción de Inventario Sin Documento


----------------------------------------------------------------------------------------

**129 -** Api de Salida Pedidos de Producción Confirmados


**125 -** Api de Salida Orden de Producción – Creación


**125 -** Api de Salida Orden de Producción – Confirmación


**Nota:** Los APIOUT, con códigos de Salida Iguales corresponden al mismo API, se diferencian por el manejo de la:
opción_i, donde se identifica el proceso diferente.


Lleva Tu Empresa Al **10**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# APIs PROVEEDORES

##### Manual de API’s


CREACIÓN Y ACTUALIZACIÓN DE PROVEEDORES


Este proceso está diseñado para manejar y controlar en forma clara y eficiente las compras.


**Datos de Cabecera:**












|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código del Proveedor|X|5|Alfanumérico||
|2|Nombre del Proveedor|X|30|Alfanumérico||
|3|RFC/RUC/CI|X|15|Alfanumérico||
|4|Contacto||30|Alfanumérico||
|5|Dirección 1||80|Alfanumérico||
|6|Dirección 2||80|Alfanumérico||
|7|Código País||5|Alfanumérico|Campo Relacionado|
|8|Código Estado||5|Alfanumérico|Campo Relacionado|
|9|Código Ciudad||5|Alfanumérico|Campo Relacionado|
|10|Código Sector||5|Alfanumérico|Campo Relacionado|
|11|Código Postal o ZIP||10|Alfanumérico||
|12|Teléfono 1||15|Alfanumérico||
|13|Teléfono 2||16|Alfanumérico||
|14|Correo Electrónico||30|Alfanumérico||
|15|Fax||16|Alfanumérico||
|16|Términos de Pago|||Integer||
|17|Límite de Crédito 1|||Real||
|18|Límite de Crédito 2|||Real||
|19|Código Tipo Proveedor||5|Alfanumérico|Campo Relacionado|
|20|Código de la Moneda||2|Alfanumérico|Campo Relacionado|
|21|Código de la Zona||5|Alfanumérico|Campo Relacionado|
|22|Notas o Memo||32000|Texto||
|23|Localización||1|Alfanumérico|valores: E= Exterior L=<br>Local|



Lleva Tu Empresa Al **12**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|24|Nombre Extenso o Razón Social||60|Alfanumérico||
|25|Código Sucursal||3|Alfanumérico||
|26|Cuenta Contable x Pagar||20|Alfanumérico|Campo Relacionado|
|27|Nombre del Banco||40|Alfanumérico||
|28|Cuenta Bancaria 1||20|Alfanumérico||
|29|Cuenta Bancaria 2||20|Alfanumérico||
|30|30. ABA, swift||15|Alfanumérico||
|31|Nombre Beneficiario||30|Alfanumérico||
|32|Código Transferencias||25|Alfanumérico||
|33|Código Transacción||25|Alfanumérico||
|34|Definible Transferencia 1||25|Alfanumérico||
|35|Definible Transferencia 2||25|Alfanumérico||
|36|Definible Transferencia 3||25|Alfanumérico||
|37|Código Retenciones||30|Alfanumérico|Campo Relacionado|
|38|Impuestos||10|Alfanumérico||
|39|Relacionada||5|Alfanumérico||
|40|Usar Nombre Alterno en Impresión|||||
|41|Número Exterior||10|Alfanumérico||
|42|Número Interior||10|Alfanumérico||
|43|Nombre Colonia||60|Alfanumérico||
|44|Nombre Localización||60|Alfanumérico||
|45|Moneda Única|||Booleano||
|46|Proveedor Global||10|Alfanumérico||
|47|Grupo de Impuestos||5|Alfanumérico||
|48|Código del Régimen Fiscal||5|Alfanumérico||
|49|Fecha de Creación del Registro|||Fecha||
|50|Cuenta Contable Reserva||20|Alfanumérico|Campo Relacionado|


Lleva Tu Empresa Al **13**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 19,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 119,


Campo: GROUP_CATEGORY_s = APIOT


**Nota 2:** Todo dato numérico se debe ingresar un valor; si no aplica, por defecto deberá ingresar el valor CERO(0).


**Nota 6:** Tome en cuenta que el campo “Opcion_i” por defecto se asignará valor CERO “0”; este controla si el
registro es de:


             - **Creación “nuevo proveedor” (Opcion_i=0)**


             - **Actualización de un proveedor existente (Opcion_i=1);** para esta operación se debe
ingresar este dato.


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN, Opcion_i **)**


**VALUES (** '19',’AMERI’,’API’,1,’2’,’192.168.181.233’,‘ P9001|PRUEBAS UNIDAS S.A.|1711253573001||DIRECCION
DAULE||ECU|17|1701|||04893680
0489367||email1@unidas.com.ec|04893137|8|0|0|01.01|US|||L|PINTURAS UNIDAS
S.A.11|PRI|20101010003|||||PINTURAS UNIDAS S.A.|||||||0;0;0;0;0;||1|||||1|||’, ’ P0001’,’ P0001’, ‘PRI’,
‘PRI’, ‘PRI’, 0 **)**


Lleva Tu Empresa Al **14**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s='19'&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=‘ P9001|PRUEBAS UNIDAS
S.A.|1711253573001||DIRECCION DAULE||ECU|17|1701|||04893680
0489367||email1@unidas.com.ec|04893137|8|0|0|01.01|US|||L|PINTURAS UNIDAS
S.A.11|PRI|20101010003|||||PINTURAS UNIDAS S.A.|||||||0;0;0;0;0;||1|||||1|||’&NumDoc_s=’
P0001’&IDConsulta_s=’ P0001’&Local_origen=‘PRI’&Local_destino=‘PRI’&ORIGIN=‘PRI’&Opcion_i=0


**Ejemplo de Creación de Proveedor:**







|Campo|Datos|
|---|---|
|**CODE_s**|19|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|P9001|PRUEBAS UNIDAS S.A.|1711253573001||DIRECCION<br>DAULE||ECU|17|1701|||04893680<br>0489367||email1@unidas.com.ec|04893137|8|0|0|01.01|US|||L|PINTURAS<br>UNIDAS S.A.11|PRI|20101010003|||||PINTURAS UNIDAS<br>S.A.|||||||0;0;0;0;0;||1|||||1||||
|**NumDoc_s**|P0001|
|**IDConsulta_s**|P0001|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**Opcion_i**|0|


**Ejemplo Web Services Salida:**


Consulta de nuevos proveedores creados en el sistema, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=119** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **15**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE SOLICITUDES DE REQUISICIONES


**Información general**


Este proceso nos permite registrar en el sistema MBA3, la información correspondiente a las Solicitudes de
Requisiciones, desde un proceso externo.


La forma de aplicar este proceso es: Por medio de una aplicación externa (Aplicación Propia del Cliente), utilizando
una conexión hacia la base de datos ( **Web Services o ODBC** ), se registra en el ERP-MBA3 y en específico en la
Tabla “SIST_API” tramas de Datos. Internamente el ERP-MBA3, lee la información, la valida y la procesa,
Obteniendo como resultado el despliegue de la información en el sistema o el registro de un mensaje de error.


**Consideraciones especiales**


    - El código de Operación de este Proceso es “23”


    - Los datos de las columnas “origin”, “local_origen”, “local_destino”, debe ser los mismos valores, y en
función de este dato se validará el Código de la Bodega que se consta en la trama de datos de la cabecera.


    - El dato en la columna “Opcion_i”, debe ser:


`o` “0 = Registro Confirmados”


    - Para el manejo de esta operación es necesario que el código de Usuario enviado en el campo “TEXT1_10”;
sea uno valido y tenga permisos necesarios


Lleva Tu Empresa Al **16**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Descripción de la Información Principal**


El contenido de la trama de datos que ingresa la información principal del registro está compuesto de la siguiente
información:


1. **Número**, Corresponde a un valor numérico entero, el mismo permite identificar el registro, es un campo

obligatorio y diferente de 0, en MBA es referencial pues el proceso el sistema MBA asigna el secuencial
correspondiente.


2. **Código de Departamento**, Corresponde al código relacional del departamento, el mismo es un valor tipo

texto de 3 caracteres, su registro es opcional y es validado la existencia o no en el ERP.


3. **Código de Área**, Corresponde al código relacional del área, el mismo es un valor tipo texto de 3 caracteres,

su registro es opcional y es validado la existencia o no en el ERP.


4. **Prioridad**, Corresponde a un valor entero, su registro es obligatorio y puede tomar los valores de

“1=Normal”, “2=Urgente”, “3=Reserva”.


5. **Código de Bodega**, Corresponde al código relacional de la bodega, el mismo es un valor tipo texto de 3

caracteres, su registro es opcional, pero si está definido es validado la su existencia y su relación con la
Sucursal definida para este registro.


6. **Número Doc. Relacionado**, Corresponde a una información alfanumérica de hasta 20 caracteres, su

registro es opcional.


7. **Fecha Solicitud**, Corresponde a la fecha de ingreso de la solicitud, el dato debe ser “dd/mm/yyyy”, su

registro es obligatorio.


8. **Fecha Requerida**, Corresponde a la fecha requerida de la solicitud, el dato debe ser “dd/mm/yyyy”, su

registro es opcional, el valor en blanco es: “00/00/00”


9. **Información Multidimensional**, Corresponde al detalle de la información de la multidimensión, este

campo es compuesto, es decir tiene varios 8 campos internos separados por punto y coma “;” y
terminados en Punto y Coma “;”. La información es: “Departamento; Centro de Costos; Proyecto;
SubProyecto; Analisis1; Analisis2; Analisis3; Memo;”, Todos excepto el último son valores relacionados y
que son validados si son ingresados.


10. **Observaciones**, Corresponde a una información alfanumérica de hasta 250 caracteres, su registro es

opcional.


Lleva Tu Empresa Al **17**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Descripción de la Información del Detalle**


El contenido de la trama de datos que ingresa la información del detalle del registro está compuesto de la
siguiente información:


1. **Tipo Producto**, Corresponde a un valor texto de 1 carácter, este campo es obligatorio, Indica P = Producto

       - C = Cuenta.


2. **Código Producto**, Corresponde a un valor texto de hasta 20 caracteres, este campo es obligatorio


3. **Cantidad** . Corresponde a un valor real, este campo es obligatorio


4. **Precio Referencial** . Corresponde a un valor tipo real, es de tipo opcional


5. **Código de Moneda** . Corresponde a un valor tipo alfanumérico de 2 caracteres, este campo es obligatorio,

si ingresa valor se relaciona con las monedas


6. **Fecha Requerida** . Corresponde a un valor fecha, este campo es Opcional.


7. **Código de Proveedor Sugerido** . Corresponde a un valor tipo alfanumérico de hasta 8 caracteres, este

campo es Opcional, si se ingresa valor será relacionado con la tabla de Proveedores


8. **Información Multidimensional**, Corresponde al detalle de la información de la multidimensión, este

campo es compuesto, es decir tiene varios 8 campos internos separados por punto y coma “;” y
terminados en Punto y Coma “;”. La información es: “Departamento; Centro de Costos; Proyecto;
SubProyecto; Análisis1; Análisis2; Análisis3, Memo;”, Todos excepto el último son valores relacionados y
que son validados si son ingresados


9. **Especificaciones** . Corresponde a un valor tipo texto de hasta 256 caracteres, este campo es Opcional


10. **Comentarios** . Corresponde a un valor tipo texto de hasta 256 caracteres, este campo es Opcional.


**NOTAS**


    - El registro de datos es por documento es decir un registro con varias líneas de detalle.


    - En los campos de cabecera y detalle se registrarán como un máximo de 32000 bits.


    - Considerar que los campos opcionales, en casos específicos si se ingresa la información si es relacionada
se validarán en el sistema.


    - Hay que tener presente, si los campos opcionales no poseen información debe conservarse la posición
del campo separado por PIPE.


    - El Final de la trama correspondiente no debe incluir PIPE


Lleva Tu Empresa Al **18**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO DATOS EN CAMPOS:**

|Campo|Datos|
|---|---|
|CODE_s|23|
|CORP_s|AMERI|
|GROUP_CATEGORY_s|API|
|INTEGER_1|1|
|LONGINT_1|Sequence number([SIST_API])|
|ORIGIN|PRI|
|TEXTO1_10|2|
|TEXTO1_24|192.168.181.233|
|TEXTO2_X|100|DP1|AR1|1|BO1|SR12345|31/12/2011|30/12/2011|;;;;;;;;|Memo|
|TEXTO3_X|P|PROD1|10|12.50|USD|31/12/2011|PRV001|;;;;;;;;|ESPECIFICACIONES<br>|COMENTARIOS|P|PROD2|20|22.50|USD|31/12/2011|PRV001|;;;;;;;;|E<br>SPECIFICACIONES|COMENTARIOS|
|NumDoc_s|200|
|Local_origen|PRI|
|Local_destino|ARA|
|IDConsulta_s|200-AMERI|
|Opcion_i|0|



**Descripción de Tabla de Datos:**


En la tabla se almacena un registro de remisiones con las siguientes características:


      - Código de Operación No. “23” (CODE_s),

      - Registro de la Empresa “AMERI” (CORP_s),

      - Categoría “API” (GROUP_CATEGORY_s),

      - Como es registro para procesar se debe enviar el valor “1” (INTEGER_1),

      - Automáticamente se genera un número secuencia de la tabla (LONGINT_1),

      - La siguiente columna indica el código de la sucursal donde se originó el registro “PRI” (ORIGIN), como
este valor es generado por una aplicación externa se recomienda ubicar el código de la sucursal
principal


Lleva Tu Empresa Al **19**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


      - El registro fue creado por el usuario de código “2” (TEXTO1_10)

      - La dirección IP “192.168.181.233” (TEXTO1_24), corresponde al número de la máquina fuente,

      - El número de documento “200” (NUMDOC_S),

      - Se debe especificar el Local origen “PRI” (LOCAL_ORIGEN),

      - Se debe especificar el Local destino “ARAI” (LOCAL_DESTINO),

      - Se debe especificar el ID del registro que viene hacer el mismo del número del documento, más el
código de la empresa “200-AMERI” (ID_CONSULTA_S)

      - Se debe especificar el tipo de acción especial del registro en este caso “0”,(Opcion_i), por ser
confirmado.

      - Los datos de “Cabecera” (TEXTO2_X) y “Detalle” (TEXTO3_X), como se muestra a continuación:


**Cabecera** :


“100|DP1|AR1|1|BOD1|SR12345|31/12/2011|30/12/2011|;;;;;;;;|Memo”


**Detalle:**


“P|PROD1|10|12.50|USD|31/12/2011|PRV001|;;;;;;;;|ESPECIFICACIONES|COMENTARIOS”


**EJEMPLO SENTENCIA SQL**


**INSERT INTO** SIST_API


**(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X, TEXTO3_X,
NumDoc_s; Origin; Local_Destino; Local_Origen; IDConsulta_s; Opcion_i **)**


**VALUES**
**(** ‘23’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,’TRAMACABECERA’,’TRAMADETALLE’,‘9’;‘ARA’,‘PRI’,‘ARA’,‘INF12345’;
0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘23’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’TRAMACABECERA’&TEXTO
3_X=’TRAMADETALLE’&NumDoc_s; Origin; Local_Destino; Local_Origen; IDConsulta_s; Opcion_i=‘9’;‘ARA’


Lleva Tu Empresa Al **20**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN Y ACTUALIZACIÓN DE ÓRDENES DE COMPRAS


Este proceso permite registrar en MBA3 Orden de Compras, en estado: Ver/Editar y/o Confirmadas,
adicionalmente el API permite aumentar líneas de detalle en Ordenes no Confirmadas.


**Datos de Cabecera:**











|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código del Proveedor|X|5|Alfanumérico||
|2|Número Orden de Compra|X|20|Alfanumérico|Si es Nueva este número es<br>Referencial.<br>Si es Actualizar, es una orden de<br>compra existente.<br>Valida con Campo : Opcion_i|
|3|Fecha de la Orden|X||Date|Formato: dd/mm/aa.|
|4|Fecha Requerida|||Date|Formato: dd/mm/aa|
|5|Código de la Moneda|X|2|Alfanumérico|Campo Relacionado|
|6|Código de la Bodega|X|3|Alfanumérico|Campo Relacionado|
|7|Validación de Importación||50|Alfanumérico||
|8|Valor de la Cotización|||Real|Solo si la cotización es diferente<br>a la Moneda 1 del Sistema|
|9|Memo 1|||Texto||
|10|Memo 2|||Texto||
|11|Referencia Proveedor||10|Alfanumérico||
|12|Código de Transporte||5|Alfanumérico||
|13|Guía de Embarque|||||
|14|Información del Transporte||20|Alfanumérico||
|15|Memo Transporte|||Texto||
|16|Fecha Transporte|||Date|Formato: dd/mm/aa|
|17|Hora Transporte|||Time||
|18|Código País de Origen||8|Alfanumérico||
|19|Código Estado de Origen||8|Alfanumérico||
|20|Código Ciudad de Origen||8|Alfanumérico||
|21|Valor del Descuento Total|||Real|Por Documento|


Lleva Tu Empresa Al **21**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**





|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código del Producto|X|20|Alfanumérico||
|2|Validación del Impuesto|||Real||
|3|Cantidad|||Real||
|4|Cajas|||Real||
|5|Descuento por Línea de Detalle|||Real||
|6|Precio de Compra Producto|||Real||
|7|Código del Impuesto||3|Alfanumérico||
|8|Multidimensión||80|Alfanumérico|Conjunto de datos separados y<br>terminados en (;) en el<br>siguiente orden Departamento;<br>Centro de Costo; Proyecto;<br>Sub-proyecto; Análisis 1;<br>Análisis 2; Análisis 3; Memo<br>Proyecto;|


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 18,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 118,


Campo: GROUP_CATEGORY_s = APIOT





**Nota 2:** El número de la Orden de compra, cuando es de CREACION el sistema lo asigna automáticamente, caso
contrario el sistema recuperará la Orden de Compra y añadirá todas las líneas de detalle ingresadas en el API.


             - **Opcion_i** = 0: Nueva Orden de Compra.


             - **Opcion_i** = 1: Añadir Detalle a Orden de Compra Existente.


             - **Opcion_i** = 2: Nueva Orden de Compra - Confirmada


Lleva Tu Empresa Al **22**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN, Opcion_i **)**


**VALUES(** '18',’AMERI’,’API’,1,’2’,’192.168.181.233’,‘ 0039|0|00/00/00|00/00/00|US||0|0|MEMO UNO|MEMO
DOS||||||00/00/00|||||’, KM1||0|0||0||;;;;;;;;;',250244,’AMERI-250244’, ‘PRI’, ‘PRI’, ‘PRI’,0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s='18'&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=‘
0039|0|00/00/00|00/00/00|US||0|0|MEMO UNO|MEMO
DOS||||||00/00/00|||||’&TEXTO3_X=KM1||0|0||0||;;;;;;;;;'&NumDoc_s=250244&IDConsulta_s=’AMERI250244’&Local_origen=‘PRI’&Local_destino=‘PRI’&ORIGIN=‘PRI’&Opcion_i=0


**Ejemplo de Órdenes de Compra:**

|Campo|Datos|
|---|---|
|**CODE_s**|18|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|0039|0|00/00/00|00/00/00|US||0|0|MEMOUNO|MEMO<br>DOS||||||00/00/00||||||
|**TEXTO3_X**|KM1||0|0||0||;;;;;;;;;|
|**NumDoc_s**|250244|
|**IDConsulta_s**|AMERI-250244|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**Opcion_i**|0|



Lleva Tu Empresa Al **23**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Ejemplo Web Services Salida:**


Consulta de nuevas Órdenes de Compra, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=118** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **24**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN FACTURAS DE PROVEEDORES


El proceso de facturación a proveedores consiste en la creación del documento principal (Factura) donde se
incluye datos que identifican al documento en forma única.


**Datos de Cabecera:**

























|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Factura|X||Real|No permite el envío de cero|
|2|Código del Proveedor|X|8|Alfanumérico||
|3|Código de la Moneda|X|2|Alfanumérico||
|4|Fecha de la Factura|X||Date|Formato dd/mm/aa|
|5|Código de la Sucursal|X|3|Alfanumérico||
|6|Valor descuento por Factura|||Real||
|7|Porcentaje de Descuento|||Real|Rango entre 0 Y 100|
|8|Estado de Recepción||||Total o Parcial|
|9|Si la Factura fue Recepcionada|||Booleano|1 = Recepcionada;<br> 0 = No Recepcionada (x<br>defecto)|
|10|Cotización|||Real||
|11|Campo Memo de la Factura|||Texto||
|12|Documento Relacionado a la Factura||20|Alfanumérico||
|13|# de pagos de la Factura|||Real||
|14|Multidimensión||80|Alfanumérico|Códigos separados y<br>terminados en(;) en el siguiente<br>orden: Departamento; Centro<br>de Costo; Proyecto;<br>Subproyecto; Análisis 1; Análisis<br>2; Análisis 3; Memo Proyecto;|
|15|Código Retención aplicada a la<br>Factura||2|Alfanumérico||
|16|Porcentaje de la Retención|||Real||
|17|Monto de la Retención|||Real||
|18|Nombre en pago||30|Alfanumérico||
|19|Código del tipo de comprobante||5|Alfanumérico|Campo Relacionado|


Lleva Tu Empresa Al **25**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|20|Campos Adicionales||||En este campo los valores serán<br>separado y terminados con (;),<br>el orden a enviar:<br>5 campos alfanuméricos de 20<br>caracteres,<br>5 campos reales, si no se envía<br>valor debe ir cero y 5 campos<br>tipo fecha, si no se envía valor<br>debe ir 00/00/00|
|21|Código de Sucursal de Recepción||3|Alfanumérico|Campo Relacionado|
|22|Código del Bodega de Recepción||3|Alfanumérico|Campo Relacionado|


**Datos de Detalle:**












|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código del Producto|X|20|Alfanumérico||
|2|Cantidad del Producto a Facturar|X||Real|No puede ser 0|
|3|Valor del Costo de la Compra|||Real||
|4|Si aplica Impuesto 1|||Booleano|0: No aplica, 1: aplica, VACIO:<br>toma parámetros del sistema|
|5|Si aplica Impuesto 2|||Booleano|0: No aplica, 1: aplica, VACIO:<br>toma parámetros del sistema|
|6|Si aplica Impuesto 3|||Booleano|0: No aplica, 1: aplica, VACIO:<br>toma parámetros del sistema|
|7|Si aplica Impuesto 4|||Booleano|0: No aplica, 1: aplica, VACIO:<br>toma parámetros del sistema|
|8|Si aplica Impuesto 5|||Booleano|0: No aplica, 1: aplica, VACIO:<br>toma parámetros del sistema|
|9|Si aplica Crédito Tributario|||Booleano|0: No aplica, 1: aplica|
|10|Multidimensión||80|Alfanumérico|Códigos separados y<br>terminados en (;)<br>Departamento; Centro de<br>Costo; Proyecto; Subproyecto;<br>Análisis 1; Análisis 2; Análisis 3;<br>Memo Proyecto;|



Lleva Tu Empresa Al **26**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Para este tipo de documento se generan cuotas de pago, dependiendo del número de cuotas se agregará la
información en este orden y los siguientes datos:


**Datos de Cuotas:**







|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Fecha pago de la cuota|||Date|Formato "dd/mm/aa|
|2|Valor de la Cuota|||Real||
|3|Valor de la Retención|||Real||


**Como datos de Retenciones en el caso de aplicar varias de las mismas tenemos:**












|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código de la Retención||2|Alfanumérico|Campo Relacionado|
|2|Base de la Retención|||Real||
|3|Total de la Retención|||Real||
|4|Memo de la Retención|||Texto||
|5|Multidimensión||80|Alfanumérico|Códigos separados y<br>terminados en(;) en el siguiente<br>orden: Departamento; Centro<br>de Costo; Proyecto;<br>Subproyecto; Análisis 1; Análisis<br>2; Análisis 3; Memo Proyecto;|



**Nota 1:** El código de operación para éste proceso en la Entrada de Datos es **“14”.**


**Nota 2:** Si se aplica retenciones deberá ubicar en el campo Texto 4B_x. Si son varias retenciones deberán ir
separadas por punto y coma (;).


Lleva Tu Empresa Al **27**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 3:** Para el manejo de los impuestos o grupos de impuestos:


      - Si el sistema detecta en los campos “ **Si aplica iva** X” (X, valor de 1 a 5) tienen valor “ **VACIO** ”, el sistema
tomará la parametrización establecida en el Producto de Software.


      - Si el sistema detecta en los campos “ **Si aplica iva** X” (X, valor de 1 a 5) tienen valor “ **1** ”, el sistema
aplicará el impuesto a este producto y la jerarquía se aplicara de acuerdo a la parametrización del
Producto de Software.


      - Si el sistema detecta en los campos “ **Si aplica iva** X” (X, valor de 1 a 5) tienen valor “ **0** ”, el sistema no
aplicara el impuesto a este producto.


**Nota 4:** La jerarquía para aplicar impuestos es la siguiente:


      - Si en la ficha del producto en el grupo de impuesto se asigna un tipo de impuesto y es diferente a
“ **General** ”, se aplicará este impuesto.


      - Si en la ficha de producto el tipo de impuesto es “General”, el sistema verificará si tiene asignado un
tipo de impuesto en la ficha de proveedor, si lo tiene, se procederá aplicar este impuesto; caso
contrario el sistema verificará si tiene asignado un grupo de impuesto en la sucursal de ser esto
verdadero aplicará este impuesto, caso contrario aplicará el impuesto asignado a nivel de empresa.


**Nota 5:** El campo “Cotización” enviado en la cabecera de la factura, si no se envía valor o es valor CERO, el sistema
obtendrá la cotización de esa fecha o una cercana ingresada en el sistema.


**Nota 6:** Se debe tener muy en cuenta que el campo “Cotización” enviado en la cabecera de la factura, el sistema
tomará este valor en la recepción de inventario.


Lleva Tu Empresa Al **28**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# APIs INVENTARIOS

##### Manual de APIs v19.0


CREACIÓN Y ACTUALIZACIÓN DE PRODUCTOS


El API “Creación o Actualización de Productos”, permite crear un registro nuevo de producto o actualizar datos
del mismo, siempre y cuando este exista para el CORP correspondiente en que fue asentada la información. Se
debe tener muy en cuenta que existe información que es relacionada, es decir que debe existir en la Base de Datos
ya que se hace referencia de la misma a través de sus códigos; para lo cual el proceso primero verifica y lo valida
antes de asentar o grabar la información en las tablas correspondientes que afecta la creación o actualización de
Productos.


**Datos de Cabecera:**













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código Producto|X|20|Alfanumérico||
|2|Nombre Producto|X|30|Alfanumérico||
|3|Categoría||15|Alfanumérico||
|4|Unidad de Medida||5|Alfanumérico||
|5|Código de Grupo||5|Alfanumérico|Campo Relacionado|
|6|Código de Subgrupo||5|Alfanumérico|Campo Relacionado|
|7|Paga IVA|X||Booleano||
|8|Código Tipo Producto|X|1|Alfanumérico|C: Consumo; P: Venta;<br>S: Servicio; M: Materia<br>Prima|
|9|Cuenta Costo de Venta|X|11|Alfanumérico|Según el Tipo de<br>Producto|
|10|Cuenta Costo de Ingreso|X|11|Alfanumérico|Según el Tipo de<br>Producto|
|11|Cuenta Costo de Inventario|X|11|Alfanumérico|Según el Tipo de<br>Producto|
|12|Cuenta Costo de Gasto|X|11|Alfanumérico|Según el Tipo de<br>Producto|
|13|Código Unidad de Medida||10|Alfanumérico||
|14|Unidad Medida de Control|||Booleano||
|15|Lotes|X||Booleano||


Lleva Tu Empresa Al **30**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|16|Seriales|X||Booleano||
|17|Número Inicial de Lote|||Entero||
|18|Número Inicial de Serial|||Entero||
|19|Código Ultima Compra|||Real||
|20|Código Ultima Compra 2|||Real||
|21|Costo Reposición|||Real||
|22|Costo Reposición 2|||Real||
|23|Peso Neto|||Real||
|24|Peso Bruto|||Real||
|25|Porcentaje Comisión 1|||Real||
|26|Porcentaje Comisión 2|||Real||
|27|Valor Comisión 1|||Real||
|28|Valor Comisión 2|||Real||
|29|Control Automático o Parcial|X||Booleano||
|30|Precio 1|||Real|Moneda 1 por Defecto|
|31|Precio 2|||Real|Moneda 1 por Defecto|
|32|Precio 3|||Real|Moneda 1 por Defecto|
|33|Precio 4|||Real|Moneda 1 por Defecto|
|34|Precio 5|||Real|Moneda 1 por Defecto|
|35|Precio 1|||Real|Segunda Moneda|
|36|Precio 2|||Real|Segunda Moneda|
|37|Precio 3|||Real|Segunda Moneda|
|38|Precio 4|||Real|Segunda Moneda|
|39|Precio 5|||Real|Segunda Moneda|
|40|Días Caducidad|||Entero|Expresado en Días|


Lleva Tu Empresa Al **31**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|41|Código Grupo de Impresión<br>Factura||5|Alfanumérico||
|42|No Generar BackOrder|||Entero|Pedidos de Clientes|
|43|Largo|||Real||
|44|Ancho|||Real||
|45|Alto|||Real||
|46|Volumen|||Real||
|47|Descripción Adicional|||Texto||
|48|Nombre Alterno 2||50|Alfanumérico||
|49|Nombre Alterno 3||50|Alfanumérico||
|50|Partida Arancelaria||20|Alfanumérico||
|51|Presentación||20|Alfanumérico||
|52|Código Impuesto||5|Alfanumérico|Campo Relacionado|
|53|Cuarentena|X||Booleano|Producto de Ingreso Automático a<br>bodega de Control de Calidad /<br>cuarentena|
|54|Bodega Cuarentena||3|Alfanumérico||
|55|Lote Mínimo|||Real||
|56|Lote Máximo||5|Real||
|57|Lote Estándar|||Real||
|58|Lote Inicio Producción|X||Booleano||
|59|Fecha Creación Receta|||Date|Formato: dd/mm/aa|
|60|Unidades Empaque|||Real|Numérico|
|61|Porcentaje de Tolerancia en<br>Recepciones|||Real|El rango va desde 1 hasta 100|


Lleva Tu Empresa Al **32**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|62|Facturar Empaques Enteros|X||Booleano||
|63|Producto con Segunda<br>Unidad|X||Booleano||
|64|Producto de Empaques|X||Booleano||
|65|Unidad de Medida de la<br>Segunda Unidad||5|Alfanumérico||
|66|Ajuste Primera Unidad|X||Booleano||
|67|Al Facturar Generar una línea<br>por Empaque|X||Booleano||
|68|Análisis Adicional|X||Booleano||
|69|Código Bodega de Ingreso||3|Alfanumérico|Por defecto Producto Terminado|
|70|Código Bodega de Ingreso|X|3|Alfanumérico|Por defecto Producto en Proceso|
|71|Código Alterno Producto||20|Alfanumérico||
|72|Código Cuenta Predial|X||Texto||
|73|Disponible||10|Alfanumérico||
|74|Código Grupo de Precios||5|Alfanumérico|Campo Relacionado|
|75|No Permitir dar Descuentos|X||Booleano||
|76|Descuento por Producto|||Real|Numérico|
|77|Departamento||3|Alfanumérico|Utilizado para Multidimensión|
|78|Centro de Costos||3|Alfanumérico|Utilizado para Multidimensión|
|79|Proyecto||3|Alfanumérico|Utilizado para Multidimensión|
|80|Sub-Proyecto||3|Alfanumérico|Utilizado para Multidimensión|
|81|Análisis 1||3|Alfanumérico|Utilizado para Multidimensión|
|82|Análisis 2||3|Alfanumérico|Utilizado para Multidimensión|
|83|Análisis 3||3|Alfanumérico|Utilizado para Multidimensión|
|84|Código de Grupo de Lotes||5|Alfanumérico|Siempre y cuando el producto<br>maneje Lotes|
|85|Código de Etiqueta|||Entero|Campo Relacionado|


Lleva Tu Empresa Al **33**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|86|Número de Etiquetas a<br>Imprimir|||Entero||
|87|Recepción de producto<br>ingreso a Bodega|||Booleano|Bodega de Control de Calidad /<br>Cuarentena|
|88|Código de la Bodega||3|Alfanumérico|Para la bodega Control de Calidad /<br>Cuarentena|
|89|Estatus de Ingreso||5|Alfanumérico|Para Producto Lotizado|
|90|Ubicación||15|Alfanumérico||
|91|Producto de Ingreso<br>Automático|||Booleano|A Bodega de Control de Calidad /<br>Cuarentena para Producción|
|92|Código de la Bodega||3|Alfanumérico|Control de Calidad / Cuarentena<br>para Ingreso Automático en<br>Producción|
|93|Estatus de Ingreso||5|Alfanumérico|Para Producto Lotizado en Control<br>de Calidad / Cuarentena para<br>Producción|
|94|Ubicación||15|Alfanumérico|Control de Calidad / Cuarentena<br>(Producción)|
|95|Tipo Orden de Producción||5|Alfanumérico||
|96|Tipo de Producto||5|Alfanumérico||
|97|Usar descripción en<br>Impresión|X||Booleano||
|98|Precio Definido|X||Booleano||
|99|Precio Automático (Margen)|X||Booleano||
|100|Precio Abierto (Sin Control)|X||Booleano||


Lleva Tu Empresa Al **34**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|101|Precio Abierto (Mínimo Venta)|X||Booleano||
|102|Precio Abierto (Superior Costo)|X||Booleano||
|103|Precio Abierto (Margen)|X||Booleano||
|104|Precio Referencia Mercado M1|||Real|Precio Moneda 1|
|105|Precio Referencia Mercado M2|||Real|Precio Moneda 2|
|106|Pedimento Únicamente|||Booleano||
|107|Obligatoriedad Adicionales|||Booleano|Facturas / Pedidos|
|108|Grupo de Prenda||5|Alfanumérico||
|109|Talla||5|Alfanumérico||
|110|Color||5|Alfanumérico||
|111|Familia/Modelo||5|Alfanumérico||
|112|Temporada||5|Alfanumérico||
|113|Año Temporada||5|Alfanumérico||
|114|URL Producto|||Texto||
|115|Nivel de Facilidad de Venta|||Entero|Valores Posibles: -3,-2,-1,0,1,2,3. Por<br>defecto el Valor es 0 (cero), si no se<br>define toma el valor 0 (cero)|
|116|Manejo Impuesto 2|||Booleano||
|117|Código de Impuesto 2||5|Alfanumérico||
|118|Cuenta de Ingreso Extranjero||20|Alfanumérico||
|119|Fecha de Creación del Registro|||Fecha||
|120|Código Alterno 2 / Base||20|Alfanumérico||
|121|Código Agrupador 1||8|Alfanumérico|Datos Relacional|
|122|Código Agrupador 2||8|Alfanumérico|Datos Relacional|
|123|Precio Mínimo|||Entero||
|124|Referencia Externa (Fiscal/ISO)||20|Alfanumérico|Campo Relacional – Lista Fiscal|
|125|Precio Incluido Impuestos|||Booleano|0 = False / 1 = True (A)|


Lleva Tu Empresa Al **35**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|126|Código de Marca||5|Alfanumérico|Datos Relacional|
|127|Código de Modelo/Linea||5|Alfanumérico|Datos Relacional|
|128|Código de<br>SubModelo/Sublinea||5|Alfanumérico|Datos Relacional|
|129|Uso de Balanza en Facturación|||Booleano|0 = False / 1 = True|
|130|Rendimiento|||Real||
|131|Tolerancia - Rendimiento|||Real||
|132|Método Uso de Balanza Prod.|||Real|Valores posibles:<br>  1=Ingreso Peso<br>  2=Ingreso Unidad/Peso<br>  3=Ingreso solo Unidad<br>  0=Ninguno x Defecto.|
|133|Al Utilizar Lector Código Barras<br>Asignar la Totalidad del<br>Mismo.|||Booleano|0 = False / 1 = True<br>Aplica solo Productos Lotes.|
|134|Bloqueado/No Ventas.|||Booleano|0 = False / 1 = True<br>Aplica solo Productos Lotes.|
|135|Bloqueado/No Compras.|||Booleano|0 = False / 1 = True<br>Aplica solo Productos Lotes.|
|136|Sincroniza Franquicias.|||Booleano|0 = False / 1 = True<br>Aplica solo Productos Lotes.|
|137|Tienda Ecomerce|||Booleano|0 = False / 1 = True<br>Aplica solo Productos Lotes.|


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 16,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 116,


Campo: GROUP_CATEGORY_s = APIOT


Lleva Tu Empresa Al **36**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 2:** Tome en cuenta que el campo **“Opcion_i**


             - **Opcion_i = 0;** Creación nuevo producto **– Por Defecto**


             - **Opcion_i = 1;** Actualización de un producto existente.


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, TEXTO4_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN, Opcion_i **)**


**VALUES(** “16”,”AMERI”,”API”,1,”2”,”192.168.181.233”,”TRAMA”,"","",9,”RP1-AMERI”, ”PRI”’, PRI”, ”PRI”, 0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=“16”&GROUP_CATEGORY
_s=”API”&INTEGER_1=1&TEXTO1_10=”2”&TEXTO1_24=”192.168.181.233”&TEXTO2_X=”TRAMA”&TEXTO3_X="
"&TEXTO4_X=""&NumDoc_s=9&IDConsulta_s=”RP1AMERI”&Local_origen=”PRI”’&Local_destino=PRI”&ORIGIN=”PRI”&Opcion_i=0


Lleva Tu Empresa Al **37**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO**







|Campo|Datos|
|---|---|
|**CODE_s**|16|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|RP1|RP1|||||0|S|6101010100|6101010100|1103010100|1103010100||0|0|0<br>|0|0|11|0|0|0|0|0|0|0|0|0|0|111|0|0|0|0|11.11|0|0|0|0|0||0|0|0|0|0||<br>|||||0||0|0|0|0|17/12/2018|0|0|0|0|0||0|0|0||||1103010100|||0|0|||||<br>||||0|0|0||||0||||||0|1|0|0|0|0|0|0|0|0|0||||||||0|||6101010100|00/0<br>0/00|||||0|0||||0|||||||||
|**NumDoc_s**|9|
|**IDConsulta_s**|PROD-AMERI|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**Opcion_i**|0|


**Ejemplo Web Services Salida:**


Consulta de nuevos productos ingresados al sistema, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=116** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **38**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


AJUSTE DE INVENTARIO (MA / TE / TI)


El proceso de AJUSTE DE INVENTARIOS consiste en generar un ajuste de existencias (+/-) CONFIRMADO; además
tener en cuenta los Tipos de Ajustes:

|Código|Descripción|
|---|---|
|MA|AJUSTE|
|TE|TRANSFERENCIA DE EGRESO|
|TI|TRANSFERENCIA DE INGRESO|



Lleva Tu Empresa Al **39**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Cabecera:**























|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de Control<br>Externo|X||Entero|Número de control externo, MBA<br>valida su no duplicación, el número de<br>ajuste lo asigna el Secuencial.|
|2|Código Bodega Origen|X|3|Alfanumérico|Campo Relacionado|
|3|Memo|||Texto||
|4|Código Sucursal Destino|X|3|Alfanumérico|Campo Relacionado|
|5|Código Sucursal Origen|X|3|Alfanumérico|Campo Relacionado|
|6|Código del Tipo de Ajuste|X|3|Alfanumérico|Aplica solo a Ajuste de Inventario|
|7|Código del Sub-Tipo de<br>Ajuste||3|Alfanumérico|Aplica solo a Ajuste de Inventario|
|8|Código Cuenta de Ajuste||11|Alfanumérico|Aplica solo a Ajuste de Inventario|
|9|Transferencia Manual||2|Alfanumérico||
|10|Referencia Externa||5|Alfanumérico||
|11|Orden de Compra Ligada|||Real|Aplica para Devoluciones|
|12|Multidimensión Cabecera||80|Alfanumérico|Conjunto de datos separados y<br>terminados en (;) en el siguiente<br>orden: Departamento; Centro de<br>Costo; Proyecto; Sub-Proyecto; Análisis<br>1; Análisis 2; Análisis 3; Memo<br>Proyecto;|
|13|Tipo de Ajuste||||(MA, TE, TI)|
|14|Código Bodega Destino||3|Alfanumérico|Este campo solo aplica en<br>Transferencias de Egreso e Ingreso|
|15|Egreso Original|||Real||
|16|Código del Proveedor||5|Alfanumérico|Aplica para Devoluciones|
|17|Referencia del Documento<br>Externo||20|Alfanumérico|Externo del Proveedor en el caso de<br>Devolución y Externo de Producción en<br>el caso de TE|
|18|Fecha del Ajuste o<br>Transferencia|||Date|Formato: dd/mm/aa|
|19|Monto del Ajuste|||Real|Aplica solo Ajuste de Inventario - MA|


Lleva Tu Empresa Al **40**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|20|Nota Débito o Crédito|Col3|Col4|Real|Col6|
|---|---|---|---|---|---|
|21|Valor del Impuesto 1|||Real||
|22|Valor del Descuento|||Real||
|23|Valor del Impuesto 2|||Real||
|24|Valor del Impuesto 3|||Real||
|25|Valor del Impuesto 4|||Real||
|26|Valor del Impuesto 5|||Real||
|27|Número de Traspaso<br>(Pedido Interno)|||Texto|Corresponde al número del sistema del<br>traspaso (pedido interno), solo aplica<br>para Transferencia de Egreso.|



Lleva Tu Empresa Al **41**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**










|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código del Producto|X|30|Alfanumérico||
|2|Listado de Seriales|||Texto|Separados por (;) y terminado en (;)|
|3|Listado de Lotes|||Texto|Conjunto de datos separados por (;)<br>Para el Registro de MA (+) Nuevo: <br>(Lote_interno;<br>Lote_externo;<br>Ubicación; Cantidad; Fecha Ingreso;<br>Fecha Elaboración; Fecha Caducidad;<br>Número<br>Pedimento;<br>Fecha_Pedimento;<br>Puerto_Entrada_Pedimento;<br>Puerto_Origen_Pedimento;<br>Codigo_Tipo_Pedimento;<br>Codigo_Estado_Lote;<br>Calificación;<br>Temperatura;<br>Número<br>Piezas;<br>Codigo_Empaque_Tara; Memo)<br> <br>Para el Registro de MA (+) Actualizar, <br>(para su uso ver nota 8): <br>(Lote; Cantidad; Ubicación; Cantidad)<br> <br>Para el Registro de MA (-) o TE definir: <br>(Lote; Cantidad; Ubicación; Cantidad)<br> <br>Para el Registro de TI definir: <br>No Aplica|
|4|Signo de Ingreso (+/-)|X||Texto|Ajuste Manuales - MA: "+/-" o “I/E”<br>Transferencia Egreso - TE="-" o “E”<br>Transferencia Ingreso -  TI= "+" O “I”|
|5|Listado de Empaques|||Texto||
|6|Cantidad|X||Real||
|7|Cantidad 2  (Segunda Unidad)|||Real||
|8|Costo Promedio|||Real||



Lleva Tu Empresa Al **42**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|9|Multidimensión Detalle|Col3|80|Alfanumérico|Conjunto de datos separados y<br>terminados en (;) en el siguiente<br>orden: Departamento; Centro de<br>Costo; Proyecto; Sub-Proyecto;<br>Análisis 1; Análisis 2; Análisis 3;<br>Memo Proyecto;|
|---|---|---|---|---|---|
|10|Total por Línea de Detalle|||Real||
|11|Total por Producto|||Real||
|12|Total de Impuesto|||Real||
|13|Total Neto por Línea|||Real||
|14|Valor del Impuesto 2|||Real||
|15|Valor del Impuesto 3|||Real||
|16|Valor del Impuesto 4|||Real||
|17|Valor del Impuesto 5|||Real||
|18|Valor del Descuento|||Real||



Lleva Tu Empresa Al **43**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 1:** Detalle de Operaciones


Entrada de Datos:


Campo: CODE_s = 12,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 112,


Campo: GROUP_CATEGORY_s = APIOT


**Nota 2:** Dentro del Sistema de MBA3 existe la parametrización para crear Ubicaciones automáticamente en el
manejo de Lotes.


Si éste parámetro no está habilitado, el proceso valida la Ubicación enviada a través del API a una existente
en el sistema.


**Nota 3:** Si en el Sistema MBA 3 existe creada la Ubicación “N/U”, el proceso pasa por alto las Ubicaciones enviadas

   - no enviadas y se asigna todo a la Ubicación “N/U”.


**Nota 4:** Para el Manejo de Ajustes de Inventario para el manejo del Costo Promedio, se tiene el usa el campo
**“Opcion_i”** de la siguiente forma:


       - **0:** Toma el valor que se envía en el API.

       - **1:** Maneja costo promedio de la ficha del producto.


**Nota 5:** Para el Manejo de Transferencias de Egreso el campo **“Opcion_i”,** se maneja así:


       - **0:** Valor Por defecto


**Nota 6:** Para el caso de manejo de Transferencias de Ingreso el campo **“Opcion_i”,** se maneja así:


       - **0:** La Búsqueda del Egreso la hace sobre el Campo : Doc_ID

       - **1:** La Búsqueda del Egresa lo hace sobre el Campo : Referencia API


**Nota 7:** Para el manejo de Transferencias de Ingreso (TI) es necesario que los datos del detalle sean similar a
los de la Transferencia de Egreso (TE) ya que el sistema controlará el código del producto cantidades y bodegas.


**Nota 8:** En el caso que sea un Ajuste de Inventario - MA en positivo (+) y sea necesario modificar un Lote
existentes es necesario especificar ese tipo de operación para todo el detalle del documento, definir en la
tabla/columna: [SIST_API]Integer_6 como 1.


Lleva Tu Empresa Al **44**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Lleva Tu Empresa Al **45**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**AJUSTE DE INVENTARIO**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN **)**
**VALUES(** ‘12’,’AMERI’,’API’,1,’2’,’192.168.181.233’, 100|GEN|MEMO AJUSTE|PRI|PRI|SIN||50101010100||Ref
Externa||;;;;;;;;|MA|GEN|100|||20/03/2012|500|0|0|0|0|0|0|0',
636390502202|||+||10|0|10|;;;;;;;;|100|0|0|0|0|0|0|0|0',117,’AMRI_117’, 'PRI', ‘PRI’, 'PRI' **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘12’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=100|GEN|MEMO
AJUSTE|PRI|PRI|SIN||50101010100||Ref
Externa||;;;;;;;;|MA|GEN|100|||20/03/2012|500|0|0|0|0|0|0|0'&TEXTO3_X=636390502202|||+||10|0|10|
;;;;;;;;|100|0|0|0|0|0|0|0|0'&NumDoc_s=117&IDConsulta_s=’AMRI_117’&Local_origen='PRI'&Local_destino=‘
PRI’&ORIGIN='PRI'

|Campo|Datos|
|---|---|
|**CODE_s**|12|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|100|GEN|MEMO AJUSTE|PRI|PRI|SIN||50101010100||Ref<br>Externa||;;;;;;;;|MA|GEN|100|||20/03/2012|500|0|0|0|0|0|0|0|
|**TEXTO3_X**|636390502202|||+||10|0|10|;;;;;;;;|100|0|0|0|0|0|0|0|0|
|**NumDoc_s**|117|
|**IDConsulta_s**|AMERI_117|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|



Lleva Tu Empresa Al **46**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**TRANSFERENCIAS DE EGRESO**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN **)**
**VALUES(** ‘12’,’AMERI’,’API’,1,’2’,’192.168.181.233’,’
101|BDA|MEMOTRANSF|PRI|PRI|||51200001000||REF_EXTERNA||;;;;;;;;|TE|DES|50|00051||03/06/2011|0|
0|0|0|0|0|0|0’,’ KM1|||-||10||50||500|50|0|0|0|0|0|0|0',116,’TE-116’, 'PRI', ‘PRI’, 'PRI' **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘12’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=’
101|BDA|MEMOTRANSF|PRI|PRI|||51200001000||REF_EXTERNA||;;;;;;;;|TE|DES|50|00051||03/06/2011|0|
0|0|0|0|0|0|0’&TEXTO3_X=’ KM1|||||10||50||500|50|0|0|0|0|0|0|0'&NumDoc_s=116&IDConsulta_s=’TE116’&Local_origen='PRI'&Local_destino=‘PRI’&ORIGIN='PRI'

|Campo|Datos|
|---|---|
|**CODE_s**|12|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|101|BDA|MEMOTRANSF|PRI|PRI|||51200001000||REF_EXTERNA||;;;;;;;;|TE|D<br>ES|50|00051||03/06/2011|0|0|0|0|0|0|0|0|
|**TEXTO3_X**|KM1|||-||10||50||500|50|0|0|0|0|0|0|0|
|**NumDoc_s**|116|
|**IDConsulta_s**|TE-116|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|



Lleva Tu Empresa Al **47**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**TRANSFERENCIAS DE INGRESO**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN **)**
**VALUES(** ‘12’,’AMERI’,’API’,1,’2’,’192.168.181.233’,’ 101|BDA|MEMOTRANSF|PRI|PRI|||51200001000||REF
EXTERNA||;;;;;;;;|TI|DES|50|00051||03/06/2011|0|0|0|0|0|0|0|0’,’
KM1|||+||10||50||500|50|0|0|0|0|0|0|0’,116,’TI-116’, 'PRI', ‘PRI’, 'PRI' **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘12’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=’
101|BDA|MEMOTRANSF|PRI|PRI|||51200001000||REF
EXTERNA||;;;;;;;;|TI|DES|50|00051||03/06/2011|0|0|0|0|0|0|0|0’&TEXTO3_X=’
KM1|||+||10||50||500|50|0|0|0|0|0|0|0’&NumDoc_s=116&IDConsulta_s=’TI116’&Local_origen='PRI'&Local_destino=‘PRI’&ORIGIN='PRI'

|Campo|Datos|
|---|---|
|**CODE_s**|12|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|101|BDA|MEMOTRANSF|PRI|PRI|||51200001000||REF<br>EXTERNA||;;;;;;;;|TI|DES|50|00051||03/06/2011|0|0|0|0|0|0|0|0|
|**TEXTO3_X**|KM1|||+||10||50||500|50|0|0|0|0|0|0|0|
|**NumDoc_s**|116|
|**IDConsulta_s**|TI-116|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|



Lleva Tu Empresa Al **48**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Ejemplo Web Services Salida:**


Consulta de nuevos ajustes y trasferencias de inventario, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=112** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **49**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


RECEPCIÓN DE INVENTARIO


Este proceso permite Recepción de Inventario desde una Factura de Proveedores; Orden de compra o Recepción
sin Documento, la misma puede ser total o parcial, este proceso registra la información de en forma confirmada
y genera sus transacciones contables correspondientes.


**Datos de Cabecera:**











|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número del Documento|X|20|Alfanumérico|(# Factura Proveedor, # Orden de<br>Compra, son Documentos<br>Confirmados). Cero en el caso de<br>utilizar a través de un Ajuste “Otros<br>Documentos”.|
|2|Código del Proveedor|X|5|Alfanumérico||
|3|Fecha de Recepción|||Date|Formato: dd/mm/aa.|
|4|Sucursal de Origen|X|3|Alfanumérico||
|5|Código de la Bodega|X|3|Alfanumérico|A la cual se realizará la Recepción|
|6|Memo|||Texto||
|**Si el Api es utilizado para la Recepción de Inventario de Órdenes de Compra y Recepción de Inventario sin**<br>**Documento es necesario los Campos**|**Si el Api es utilizado para la Recepción de Inventario de Órdenes de Compra y Recepción de Inventario sin**<br>**Documento es necesario los Campos**|**Si el Api es utilizado para la Recepción de Inventario de Órdenes de Compra y Recepción de Inventario sin**<br>**Documento es necesario los Campos**|**Si el Api es utilizado para la Recepción de Inventario de Órdenes de Compra y Recepción de Inventario sin**<br>**Documento es necesario los Campos**|**Si el Api es utilizado para la Recepción de Inventario de Órdenes de Compra y Recepción de Inventario sin**<br>**Documento es necesario los Campos**|**Si el Api es utilizado para la Recepción de Inventario de Órdenes de Compra y Recepción de Inventario sin**<br>**Documento es necesario los Campos**|
|7|Hora de la Recepción|||Time|Formato: HH:MM:SS|
|8|Nombre de la Embarcación||80|Alfanumérico||
|9|Procedencia||80|Alfanumérico||
|10|Código del Calificador|X|5|Alfanumérico||
|11|Recepción Externa||20|Alfanumérico|Denominada también Liquidación de<br>la Recepción|
|12|Chofer||80|Alfanumérico||
|13|Código del Supervisor|X|5|Alfanumérico||
|14|Cinco Campos Adicionales|||Alfanumérico|Separados por Punto y Coma|
|15|Cinco Campos Adicionales|||Date|Separados por Punto y Coma|
|16|Cinco Campos Adicionales|||Real|Separados por Punto y Coma|


Lleva Tu Empresa Al **50**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**










|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código del Producto|X|20|Alfanumérico|Campo Relacionado|
|2|Cantidad|X||Real||
|3|Serial|||Texto|Depende de la definición del producto|
|4|Datos del Lote|||Texto|Cuando el Lote es nuevo:<br> <br>Conjunto de datos separados por (;)<br>(Lote_interno_1;<br>Lote_externo_1;<br>Ubicación_1; Cantidad_1)<br> <br>Cuando el Lote ya existe:<br>(Lote_interno_1;<br>Cantidad_Lote_1;<br>Ubicación_1; Cantidad_1)|
|5|Datos del Pedimento|||Texto|Conjunto de datos separados por (;)<br>(#Pedimento; Fecha_Pedimento;<br>Entrada_Pedimento;<br>Puerto_Origen_Pedimento;<br>Codigo_Tipo_Pedimento)|
|6|Datos del Estado y<br>Calificación|||Texto|Conjunto de datos separados por (;)<br>(Codigo_Estado_Lote; Calificacion;<br>Temperatura)|
|7|Datos del Peso, Embarque y<br>Memo|||Texto|Conjunto de datos separados por (;) (#<br>Piezas; Codigo_Empaque_Tara;<br>Memo)|



Lleva Tu Empresa Al **51**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 20,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 120,


Campo: GROUP_CATEGORY_s = APIOT


**Nota 2:** Dentro de esta operación es necesario que el campo “Opcion_i” tengan los siguientes valores:


      - 0: Recepción Factura de Proveedores

      - 1: Recepción Órdenes de Compra

      - 2: Recepción de Inventario sin Tipo de Documento especifico.


Lleva Tu Empresa Al **52**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**RECEPCION DE INVENTARIO: Sobre Factura de Proveedores**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24,
TEXTO2_X, TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN, Opcion_i **)**


**VALUES(** '20','GANDH',’API’,1,’2’,’192.168.181.233’, 100|CODIGO_PROVEEDOR|20/03/12|PRI|GEN|MEMO
RECEPCION 100',' 633047033496|20||',52,’REC-52’, ‘5’, ‘PRI’, ‘PRI’,0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s='20'&GROUP_CATEGORY_s
=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=100|CODIGO_PROVEEDOR|
20/03/12|PRI|GEN|MEMO RECEPCION 100'&TEXTO3_X='
633047033496|20||'&NumDoc_s=52&IDConsulta_s=’REC52’&Local_origen=‘5’&Local_destino=‘PRI’&ORIGIN=‘PRI’&Opcion_i=0

|Campo|Dato|
|---|---|
|**CODE_s**|20|
|**CORP_s**|GANDH|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|100|CODIGO_PROVEEDOR|20/03/12|PRI|GEN|MEMO RECEPCION 100|
|**TEXTO3_X**|633047033496|20|||
|**NumDoc_s**|52|
|**IDConsulta_s**|REC-52|



Lleva Tu Empresa Al **53**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|Local_destino|PRI|
|---|---|
|**ORIGIN**|PRI|
|**Opcion_i**|0|


Lleva Tu Empresa Al **54**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24,
TEXTO2_X, TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN, Opcion_i **)**


**VALUES(** '20','FRIGO',’API’,1,’1’,’192.168.181.233’,’
0|PR001|20/03/12|PRI|GEN|Recepcion_Fact000|11:42:00|LANCHAS|TARQUI|01|35|PART|01|;;;;|;;;;|0;0;0;0;0’,’
633047033496|15|||;;;;|;;|;;’,52,’EXT-52’, ‘PRI’, ‘PRI’, ‘PRI’,2 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s='20'&GROUP_CATEGORY_s
=’API’&INTEGER_1=1&TEXTO1_10=’1’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=’
0|PR001|20/03/12|PRI|GEN|Recepcion_Fact000|11:42:00|LANCHAS|TARQUI|01|35|PART|01|;;;;|;;;;|0;0;0;0;0’&
TEXTO3_X=’ 633047033496|15|||;;;;|;;|;;’&NumDoc_s=52&IDConsulta_s=’EXT52’&Local_origen=‘PRI’&Local_destino=‘PRI’&ORIGIN=‘PRI’&Opcion_i=2


**Ejemplo de Recepción de Inventario con Otro tipo de Documento:**







|Campo|Dato|
|---|---|
|**CODE_s**|20|
|**CORP_s**|FRIGO|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|0|PR001|20/03/12|PRI|GEN|Recepcion_Fact<br>000|11:42:00|LANCHAS|TARQUI|01|35|PART|01|;;;;|;;;;|0;0;0;0;0|
|**TEXTO3_X**|633047033496|15|||;;;;|;;|;;|


Lleva Tu Empresa Al **55**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|IDConsulta_s|EXT-5|
|---|---|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**Opcion_i**|1 Orden de Compra<br>2 Recepción sin Documento|
|**Integer_6**|0 Crea Lote Nuevo (Valido Solo Orden de Compra)<br>1 Añade a Lote Existente (Valido Solo Orden de Compra)|


Lleva Tu Empresa Al **56**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Ejemplo Web Services Salida:**


Consulta de Api de salida Recepción de Inventario, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=120** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **57**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE SOLICITUD DE TRASPASOS


**Información Inicial**


Este proceso nos permite registrar en el sistema MBA3, la información correspondiente a Pedidos Internos, desde
un proceso externo.


La forma de aplicar este proceso es: Por medio de una aplicación externa (Aplicación Propia del Cliente), utilizando
una conexión hacia la base de datos ( **Web Services o ODBC** ), se registra en el ERP-MBA3 y en específico en la
Tabla “SIST_API” tramas de Datos. Internamente el ERP-MBA3, lee la información, la valida y la procesa,
Obteniendo como resultado el despliegue de la información en el sistema o el registro de un mensaje de error.


**CONSIDERACIONES ESPECIALES**


    - El código de Operación de Ingreso de este Proceso es “24”


    - El código de Operación de Salida de este Proceso es “124”


    - Los datos de las columnas “origin”, “local_origen”, corresponden a los datos de la Sucursal quien solicita,
debe ser los mismos valores, y en función de este dato se validará el código de la Bodega quien solicita,
que consta en la trama de datos de la cabecera.


    - Los datos de las columnas “local_destino”, corresponden los datos de la Sucursal de donde se solicita el
Egreso de Inventario, en función de este dato se validará el código de la Bodega de donde se solicita el
Egreso de Inventario que consta en la trama de datos de la cabecera.


    - El dato en la columna “Opcion_i”, puede ser:


`o` “0 = Registro Confirmado”


    - Para el manejo de esta operación es necesario que el código de Usuario enviado en el campo “TEXT1_10”;
sea uno valido y tenga permisos necesarios


Lleva Tu Empresa Al **58**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Descripción de la Información Principal**


El contenido de la trama de datos que ingresa la información principal del registro está compuesto de la siguiente
información:


**1.** **Número,** Corresponde a un valor numérico entero, el mismo permite identificar el registro, es un campo

obligatorio y diferente de 0, en MBA es referencial pues el proceso el sistema MBA asigna el secuencial
correspondiente.


**2.** **Fecha de Pedido**, Corresponde a la fecha del pedido, el dato debe ser “dd/mm/yyyy”, su registro es

obligatorio no puede ser blanco.


**3.** **Fecha de Entrega**, Corresponde a la fecha del entrega, el dato debe ser “dd/mm/yyyy”, su registro es

obligatorio no puede ser blanco.


**4.** **Nombre de Solicitante,** Corresponde a una información alfanumérica de hasta 30 caracteres, su registro

es opcional.


**5.** **Tipo de Pedido**, Corresponde a una información de 2 caracteres los valores posibles pueden ser: TR =

Transferencias o AK = Armado de Kits.


**6.** **Código Medio de Captura**, Corresponde a un valor alfanumérico de hasta 5 caracteres, este campo es

opcional y si es ingresado se validada su relación en la base.


**7.** **Código de Transporte**, Corresponde a un valor alfanumérico de hasta 5 caracteres, este campo es opcional

y si es ingresado se validada su relación en la base.


**8.** **Código del Vendedor** ; Corresponde a un valor alfanumérico de hasta 5 caracteres, este campo es opcional

y si es ingresado se validada su relación en la base.


**9.** **Código de Bodega quien solicita** ; Corresponde a un valor alfanumérico de hasta 3 caracteres, este campo

es obligatorio, se validada su relación en la base con la Sucursal Solicitante.


**10.** **Código de Bodega de donde se solicita el egreso de inventario** ; Corresponde a un valor alfanumérico de

hasta 3 caracteres, este campo es obligatorio, se validada su relación en la base con la Sucursal Solicitada.


**11.** **Memo General**, Corresponde a un valor texto este campo es opcional.


**12.** **Información Pedido**, Corresponde a un valor texto este campo es opcional.


**13.** **Mensaje a Bodegas**, Corresponde a un valor texto este campo es opcional.


**14.** **Mensaje a Producción**, Corresponde a un valor texto este campo es opcional.


**15.** **Mensaje a Cliente**, Corresponde a un valor texto este campo es opcional.


**16.** **Mensaje a Transporte**, Corresponde a un valor texto este campo es opcional.


Lleva Tu Empresa Al **59**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Descripción de la Información del Detalle**


El contenido de la trama de datos que ingresa la información del detalle del registro está compuesto de la
siguiente información:


**1.** **Código Producto**, Corresponde a un valor texto de hasta 20 caracteres, este campo es obligatorio


**2.** **Cantidad** . Corresponde a un valor real, este campo es obligatorio


**NOTAS**


      - El registro de datos es por documento es decir un registro con varias líneas de detalle.

      - Considerar que los campos opcionales, en casos específicos si se ingresa la información si es
relacionada se validarán en el sistema.

      - Hay que tener presente, si los campos opcionales no poseen información debe conservarse la posición
del campo separado por PIPE.

      - El Final de la trama correspondiente no debe incluir PIPE


Lleva Tu Empresa Al **60**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO DATOS EN CAMPOS:**

|Campo|Datos|
|---|---|
|CODE_s|24|
|CORP_s|AMERI|
|GROUP_CATEGORY_s|API|
|INTEGER_1|1|
|LONGINT_1|Sequence number([SIST_API])|
|ORIGIN|PRI|
|TEXTO1_10|2|
|TEXTO1_24|192.168.181.233|
|TEXTO2_X|100|01/01/2012|31/01/2012|USUARIO|TR|MC1|TR1|VE1|BG1|BG2|M<br>EMO|INFPED|MESBOD|MESPROD|MESCLE|MESTRA|
|TEXTO3_X|PROD1|10|PROD2|20| PROD3|30|
|NumDoc_s|200|
|Local_origen|PRI|
|Local_destino|ARA|
|IDConsulta_s|200-AMERI|
|Opcion_i|0|



Lleva Tu Empresa Al **61**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Descripción de Tabla de Datos:**


En la tabla se almacena un registro de remisiones con las siguientes características:


      - Código de Operación No. “24” (CODE_s),

      - Registro de la Empresa “AMERI” (CORP_s),

      - Categoría “API” (GROUP_CATEGORY_s),

      - Como es registro para procesar se debe enviar el valor “1” (INTEGER_1),

      - Automáticamente se genera un número secuencia de la tabla (LONGINT_1),

      - La siguiente columna indica el código de la sucursal donde se originó el registro “PRI” (ORIGIN), como
este valor es generado por una aplicación externa se recomienda ubicar el código de la sucursal
principal,

      - El registro fue creado por el usuario de código “2” (TEXTO1_10)

      - La dirección IP “192.168.181.233” (TEXTO1_24), corresponde al número de la máquina fuente,

      - El número de documento “200” (NUMDOC_S),

      - Se debe especificar el Local origen “PRI” (LOCAL_ORIGEN),

      - Se debe especificar el Local destino “ARAI” (LOCAL_DESTINO),

      - Se debe especificar el ID del registro que viene hacer el mismo del número del documento, más el
código de la empresa “200-AMERI” (ID_CONSULTA_S)

      - Se debe especificar el tipo de acción especial del registro en este caso “0”,(Opcion_i), por ser
confirmado.

      - Los datos de “Cabecera” (TEXTO2_X) y “Detalle” (TEXTO3_X), como se muestra a continuación:


**Cabecera** :


“100|01/01/2012|31/01/2012|USUARIO|TR|MC1|TR1|VE1|BG1|BG2|MEMO|INFPED|MESBOD|MESPROD|M
ESCLE|MESTRA”


**Detalle:**


“PROD1|10|PROD2|20| PROD3|30”


Lleva Tu Empresa Al **62**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO SENTENCIA SQL**


**INSERT INTO** SIST_API


**(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X, TEXTO3_X, NumDoc_s;
Origin; Local_Destino; Local_Origen; IDConsulta_s; Opcion_i **)**


**VALUES**
**(** ‘23’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,’TRAMACABECERA’,’TRAMADETALLE’,‘9’;‘ARA’,‘PRI’,‘ARA’,‘INF12345’;
0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘23’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’TRAMACABECERA’&TEXTO
3_X=’TRAMADETALLE’&NumDoc_s; Origin; Local_Destino; Local_Origen; IDConsulta_s; Opcion_i=‘9’;‘ARA’


Lleva Tu Empresa Al **63**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN Y ACTUALIZACIÓN DE PRECIOS


Este API nos permite Ingresar o Actualizar los Precios de Productos


**Datos de Trama:**







|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Secuencial|X||Numérico|Valor Secuencial|
|2|Código Producto|X|20|Alfanumérico|Campo Relacionado|
|3|Código Sucursal|X|3|Alfanumérico|Campo Relacionado|
|4|Código Moneda|X|2|Alfanumérico|Campo Relacionado|
|5|Número Lista de Precios|X||Numérico|ID de Lista de Precios|
|6|Valor de Precio||5|Real||


**NOTAS**


Nota 1:El código de operación para éste proceso de Entrada de Datos es “29”


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, TEXTO4_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN, Opcion_i **)**


**VALUES(** “29”,”AMERI”,”API”,1,”2”,”192.168.181.233”,”TRAMA”,"","",9,”RP1-AMERI”, ”PRI”’, PRI”, ”PRI”, 0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=“29”&GROUP_CATEGORY
_s=”API”&INTEGER_1=1&TEXTO1_10=”2”&TEXTO1_24=”192.168.181.233”&TEXTO2_X=”TRAMA”&TEXTO3_X="
"&TEXTO4_X=""&NumDoc_s=9&IDConsulta_s=”RP1AMERI”&Local_origen=”PRI”’&Local_destino=PRI”&ORIGIN=”PRI”&Opcion_i=0


Lleva Tu Empresa Al **64**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO:**

|Campo|Datos|
|---|---|
|CORP_s|AMERI|
|ORIGIN|PRI|
|GROUP_CATEGORY_s|API|
|CODE_s|29|
|INTEGER_1|1|
|TEXTO1_10|1|
|TEXTO1_24|192.168.181.233|
|TEXTO2_X|1|rp01|PRI|MN|1|11.11|
|Opcion_i|1|
|Local_Destino|PRI|
|Local_Origen|PRI|
|NumDoc_s|PRODUCTO-001’|
|IDConsulta_s|PRODUCTO-001’’|



Lleva Tu Empresa Al **65**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# APIs PRODUCCIÓN

##### Manual de APIs v19.0


CREACIÓN DE ÓRDENES DE PRODUCCIÓN


**Datos de Cabecera:**













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Numero de Orden de<br>Producción|X||Entero|El campo es requerido en<br>función de la configuración<br>dada en el campo : Opcion_i<br>(Ver detalles)|
|2|Fecha del Ajuste|X||Date|Formato: dd/mm/aa; Si no<br>hay información debe ir:<br>00/00/00|
|3|Código Bodega Materia<br>Prima|X|3|Alfanumérico|Campo Relacionado|
|4|Código Bodega Productos<br>en Proceso|X|3|Alfanumérico|Campo Relacionado|
|5|Código Bodega Producto<br>Terminado|X|3|Alfanumérico|Campo Relacionado|
|6|Tipo Orden de Producción||5|Alfanumérico|Campo Relacionado|
|7|Prioridad Orden de<br>Producción||5|Alfanumérico|Campo Relacionado|
|8|Estatus Orden de<br>Producción||2|Alfanumérico|Campo Relacionado; Valores<br>posibles<br>1=Planificado<br>2=Planificado en Espera<br>3=En Proceso<br>4=En Proceso en Espera<br>5=Finalizado<br>0=Ninguno|
|9|Documento de Control|||Entero|Campo Relacionado; Si no hay<br>información debe ir “0”|
|10|Número Lote||25|Alfanumérico|Campo Relacionado|
|11|Unidad de Control|||Entero|Campo Relacionado; Si no hay<br>información debe ir “0”|


Lleva Tu Empresa Al **65**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|12|Número Pedido de<br>Producción|X|25|Alfanumérico|Campo Relacionado, si se<br>ingresa este valor se<br>verificara, datos del Pedido de<br>Producción Confirmado<br>contra los datos registrados<br>en la trama, si no es necesario<br>se debe enviar Cero “0”|
|13|Fecha Requerida Interna|||Date|Formato: dd/mm/aa; Si no<br>hay información debe ir:<br>00/00/00|
|14|Fecha Requerida Cliente|||Date|Formato: dd/mm/aa; Si no<br>hay información debe ir:<br>00/00/00|
|15|Fecha Programada Inicio|||Date|Formato: dd/mm/aa; Si no<br>hay información debe ir:<br>00/00/00|
|16|Fecha Estimada Entrega|||Date|Formato: dd/mm/aa; Si no<br>hay información debe ir:<br>00/00/00|
|17|Fecha Real Inicio|||Date|Formato: dd/mm/aa; Si no<br>hay información debe ir:<br>00/00/00|
|18|Hora Requerida Interna|||Time|Formato: HH:mm:ss; Si no hay<br>información debe ir: 00:00:00|
|19|Hora Requerida Cliente|||Time|Formato: HH:mm:ss; Si no hay<br>información debe ir: 00:00:00|
|20|Hora Programada Inicio|||Time|Formato: HH:mm:ss; Si no hay<br>información debe ir: 00:00:00|
|21|Hora Real Inicio|||Time|Formato: HH:mm:ss; Si no hay<br>información debe ir: 00:00:00|
|22|Código Cliente Pedido de<br>Producción||8|Alfanumérico|Campo Relacionado|
|23|Código Producto<br>Terminado|X|20|Alfanumérico|Campo Relacionado|
|24|Ruta de Producción|X|5|Alfanumérico|Si es la Ruta Estandar =<br>ESTAN|
|25|Cantidad|X|5|Real|Valor superior a “0”|


Lleva Tu Empresa Al **66**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|26|Cantidad Segunda Unidad||5|Real|Valor superior a “0”|
|27|Multidimensión||80|Alfanumérico|Conjunto de datos separados<br>y terminados en (;) en el<br>siguiente orden:<br>Departamento; Centro de<br>Costo; Proyecto; Sub-<br>Proyecto; Análisis 1; Análisis<br>2; Análisis 3; Memo Proyecto;|
|28|Lote/Ubicación<br>del Producto Terminado|||Texto|Datos separados por (;),<br>Lote; Cantidad;<br>Ubicacion1; Cantidad1|
|29|Notas Orden|||Texto||
|30|Memo General|||Texto||
|31|Memo Bodega|||Texto||
|32|Memo Responsable|||Texto||
|33|Memo Avance|||Texto||


Lleva Tu Empresa Al **67**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código del Producto de la<br>Receta|X|20|Alfanumérico|Campo Relacionado|
|2|Tipo de Producto|X||Texto|MP= “Materia Prima”,<br>I= “INSUMOS”,<br>MA= “Maquinaria”,<br>MO= “Mano de Obra”,<br>CI= “OTROS COSTOS”,<br>VA= "Valores Adicionales",<br>SP= "Sub Productos",<br>DE= “Desperdicios”.|
|3|Aplicación del Producto|||Real|Opciones:<br>“+” Agrega a la Receta de Producción.<br>“-” Elimina de la Receta de<br>Producción.<br>“=” Reemplaza la cantidad enviada por<br>la cantidad de la Receta.|
|4|Cantidad del Producto|X||Real|Valor superior a “0”|
|5|Cantidad del Producto<br>Segunda Unidad|||Real|Valor superior a “0”|
|6|Listado de Lotes|||Texto|Datos separados por (;), No va al Final<br>:<br>Lote; Cantidad;<br>Ubicacion1;Cantidad1;<br>Ubicacion2;Cantidad2<br>Cantidad (Lote) = Cantidad (Ubic.)<br>Al final de Lote poner “ : ” =“2 puntos”|
|7|Listado de Seriales|||Texto|Separados por (;) y terminado en (;)|
|8|Listado de Empaques|||Texto||


Lleva Tu Empresa Al **68**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|9|Multidimensión||80|Alfanumérico|Conjunto de datos separados y<br>terminados en (;) en el siguiente<br>orden: Departamento; Centro de<br>Costo; Proyecto; Sub-Proyecto;<br>Análisis 1; Análisis 2; Análisis 3; Memo<br>Proyecto;|
|10|Memo|||Texto||


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 25,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 125,


Campo: GROUP_CATEGORY_s = APIOT





**Nota 2:** Dentro del Sistema de MBA3 existe la parametrización para crear Ubicaciones automáticamente en el
manejo de Lotes.


Si este parámetro no está habilitado, el proceso valida la Ubicación enviada a través del API a una existente en el
sistema.


**Nota 3:** Si en el Sistema MBA 3 existe creada la Ubicación “N/U”, el proceso pasa por alto las Ubicaciones
enviadas o no enviadas y se asigna todo a la Ubicación “N/U”.


**Nota 4:** Opciones específicas de API:


      - Opcion_i = 1: Crea Orden de Producción,


      - Opcion_i = 2: Entrega de Materia Prima


      - Opcion_i = 3: Confirma Orden de Producción


      - Opcion_i = 4: Crea Orden de Producción, Entrega Materia Prima y Confirma Orden de Producción.


Lleva Tu Empresa Al **69**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 5:** Dada la Opcion_i el campo “Número de Orden de Producción” será:


      - Opcion_i = 1: No Obligatorio.


      - Opcion_i = 2: Obligatorio


      - Opcion_i = 3: Obligatorio


      - Opcion_i = 4: No Obligatorio.


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN **)**


**VALUES(** ‘25’,’AMERI’,’API’,1,’2’,’192.168.181.233’,
0|27/04/2015|RPR|BPS|BPR|||0|||0|104|00/00/00|00/00/00|00/00/00|00/00/00|00/00/00|00:00|00:00|0
0:00|00:00||PT1|ESTAN|10|0|;;;;;;;;||Notas|Memo GEN|Memo BOD|Memo RES|Memo AVA,


MP1|MP|=|20|0||||;;;;;;;;|MEMO LINEA,117,’AMRI_117’, 'PRI', ‘PRI’, 'PRI' **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘25’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=0|27/04/2015|RPR|BPS|BP
R|||0|||0|104|00/00/00|00/00/00|00/00/00|00/00/00|00/00/00|00:00|00:00|00:00|00:00||PT1|ESTAN|10
|0|;;;;;;;;||Notas|Memo GEN|Memo BOD|Memo RES|Memo
AVA&TEXTO3_X=MP1|MP|=|20|0||||;;;;;;;;|MEMO
LINEA&NumDoc_s=117&IDConsulta_s=’AMRI_117’&Local_origen='PRI'&Local_destino=‘PRI’&ORIGIN='PRI'


Lleva Tu Empresa Al **70**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO AJUSTE DE INVENTARIO**

|Campo|Datos|
|---|---|
|**CODE_s**|25|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|0|27/04/2015|RPR|BPS|BPR|||0|||0|104|00/00/00|00/00/00|00/00/00|00/00/<br>00|00/00/00|00:00|00:00|00:00|00:00||PT1|ESTAN|10|0|;;;;;;;;||Notas|Memo<br>GEN|Memo BOD|Memo RES|Memo AVA|
|**TEXTO3_X**|MP1|MP|=|20|0||||;;;;;;;;|MEMO LINEA|
|**NumDoc_s**|117|
|**IDConsulta_s**|AMERI_117|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**Opcion_i**|Si = 1: Crea Orden de Producción.<br>Si = 2: Entrega de Materia Prima<br>Si = 3: Confirma Orden de Producción<br>Si = 4: Crea Orden, Entrega Materia Prima y Confirma Orden de Producción.|



**Ejemplo Web Services Salida:**


Consulta de API Ordenes de Producción, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=125** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **71**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# APIs CLIENTES

##### Manual de APIs v19.0


CREACIÓN Y ACTUALIZACIÓN DE CLIENTES


Para el proceso de creación y actualización de clientes se debe tener en cuenta que el código de operación es “05”
para el INGRESO DE INFORMACION hacia el producto de Software y “105” para la SALIDA DE INFORMACION hacia
aplicaciones externas. Además los datos asignados en los campos del Web Services o la tabla “SIST_API” son:

**Datos de Cabecera:**









|No.|Nombre Campo|Obl|Tamaño|Tipo de<br>Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código Cliente|X|8|Alfanumérico<br>|<br>|
|2|Nombre Cliente|X|30|Alfanumérico||
|3|Identificación|X <br>|15|Alfanumérico<br>|Identificación Fiscal<br>|
|4|Número Teléfono 1|<br>|14|Alfanumérico<br>|<br>|
|5|Número Teléfono 2|<br>|14|Alfanumérico<br>|<br>|
|6|Número de Fax|<br>|14|Alfanumérico<br>|<br>|
|7|Dirección 1|<br>|80|Alfanumérico<br>|<br>|
|8|Dirección 2|<br>|80|Alfanumérico<br>|<br>|
|9|Dirección 3|<br>|80|Alfanumérico||
|10|Código País|<br>|5|Alfanumérico|Campo Relacionado|
|11|Código Estado|<br>|5|Alfanumérico|Campo Relacionado|
|12|Código Ciudad|<br>|5|Alfanumérico|Campo Relacionado|
|13|Código Sector|<br>|5|Alfanumérico|Campo Relacionado|
|14|Código Postal|<br>|10|Alfanumérico<br>|Campo Relacionado<br>|
|15|E-Mail|<br>|30<br>|Alfanumérico||
|16|Límite Crédito 1|<br>|<br>|Real|Permitido para la moneda 1|
|17|Límite Crédito 2|<br>||Real|Permitido para la moneda 2|
|18|Término de Pagos||8|Entero|Expresado en días|
|19|Código Moneda|<br>|2|Booleano|Si aplica a todas las monedas el<br>campo no debe tener dato|
|20|Código Zona|<br>|5|Alfanumérico|Campo Relacionado|
|21|Código Precio Negociado|<br>|5|Alfanumérico|Campo Relacionado|
|22|Código Tipo Cliente|<br>|5|Alfanumérico|Campo Relacionado|
|23|Código Vendedor|<br>|5|Alfanumérico|Campo Relacionado|
|24|Responsable de la Cuenta|<br>|25<br>|Alfanumérico|Campo Relacionado<br>|
|25|Memo|<br>|<br>|Texto||
|26|Fecha Creación|||Fecha|Formato dd/mm/aa|
|27|Localización|X <br>|1|Alfanumérico|L: Local ó E: Extranjero|
|28|Nombre Extenso|<br>|60|Alfanumérico|Denominado también Razón Social|
|29|Código Sucursal||3|Alfanumérico|Campo Relacionado|
|30|Código Cuenta Contable||11|Alfanumérico|La cuenta contable sin separadores|
|31|Lista de Precios|X||Entero|El rango de precios es de 1 a 5|
|32|Nivel de Riesgo|X|2|Alfanumérico|El rango es del 1 al 6, tomando 6<br>como ninguno|


Lleva Tu Empresa Al **73**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|33|Código Transporte|Col3|5|Alfanumérico|Col6|
|---|---|---|---|---|---|
|**No.**|**Nombre Campo**|**Obl**|**Tamaño**|**Tipo de**<br>**Dato**|**Especificaciones**|
|34|Impuestos||10|Alfanumérico|0;0;0;0;0; -> Solo 5 impuestos|
|35|Código de cliente relacionado||8|Alfanumérico|Permite relacionar el mismo Cliente en<br>varias empresas|
|36|Código Grupo de Descuentos||25|Alfanumérico|Campo Relacionado|
|37|Fecha Acuse|X||Booleano|Modifica fecha de vencimiento en<br>función de la fecha acuse.|
|38|Productos sin Negociación|X||Booleano|No permitir facturar productos que<br>están fuera de Negociación.|
|39|Grupo Impresión Facturas|X||Booleano||
|40|Precio Convertido 1|X||Booleano|Uso Precio en moneda 2 convertido.|
|41|Precio Convertido 2|X||Booleano|Uso Precio en moneda 1 convertido.|
|42|Nombre Extenso|||Booleano|Para Usaren Impresión|
|43|Número Exterior||10|Alfanumérico||
|44|Número Interior||10|Alfanumérico||
|45|Colonia||15|Alfanumérico||
|46|Localidad||15|Alfanumérico||
|47|Número Global Cliente||20|Alfanumérico|Identificaciones Adicionales|
|48|Código Secundario Cliente||35|Alfanumérico|Identificaciones Adicionales|
|49|Municipio||30|Alfanumérico||
|50|Moneda Única|||Booleano||
|51|Identificación Fiscal 2||20|Alfanumérico||
|52|Código de Categoría||5|Alfanumérico||
|53|Código Giro del Negocio||5|Alfanumérico||
|54|Código Régimen Fiscal||5|Alfanumérico||
|55|Cobro contra Entrega|||Booleano||
|56|Código Grupo de Impuestos||5|Alfanumérico||
|57|Cliente Inactivo|||Booleano||
|58|Cliente Control|||Booleano||
|59|Estatus No Venta|||Booleano||
|60|Motivo|||Texto||


Lleva Tu Empresa Al **74**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño|Tipo de<br>Dato|Especificaciones|
|---|---|---|---|---|---|
|61|Visualización de clientes|||Entero|0 = NO VISUALIZA<br>1 = SI VISUALIZA|
|62|Tipo de Agrupación en<br>Impresión||1|Alfanumérico|P=PRODUCTOS,<br>G=GRUPOS,<br>I=IMPUESTOS,<br>BLANCO = NO APLICA|
|63|Código de Agrupación de<br>Impresión||10|Alfanumérico|VALORES POSIBLES: 2 DATOS TIPO<br>TEXTO SEPARADOS POR; (PUNTO Y<br>COMA), SI NO USA VA EN BLANCO….<br>EJEMPLO: AAA;BBB;|
|64|Email Fiscal||50|Alfanumérico||
|65|Cuenta Contable Reserva||20|Alfanumérico||
|66|Referencia / Ubigeo||30|Alfanumérico||


Lleva Tu Empresa Al **75**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**DATOS FISCALES – La Definición se basa en la dada en el Sistema**









|No|Nombre de<br>Campo|Obl|Tipo de<br>Dato|Tamaño|Definición en Fiscal / Especificaciones|
|---|---|---|---|---|---|
|1|Lista Datos 1|X|Texto|5|Tipo de Identificación Fiscal|
|2|Lista Datos 2||Texto|5|Tipo de Régimen Fiscal|
|3|Lista Datos 3||Texto|5|Países Paraísos Fiscales|
|4|Lista Datos 4||Texto|5|Tipo de Ingresos del Exterior|
|5|Lista Datos 5|X|Texto|5|Tipo de Identificación Cliente|
|6|Lista Datos 6||Texto|5|Tipo de Pago|
|7|Lista Datos 7||Texto|5||
|8|Lista Datos 8||Texto|5||
|9|Alfanumérico 1||Alfanumérico|80||
|10|Alfanumérico 2||Alfanumérico|80||
|11|Alfanumérico 3||Alfanumérico|80||
|12|Alfanumérico 4||Alfanumérico|80||
|13|Alfanumérico 5||Alfanumérico|80||
|14|Valor 1||Real|||
|15|Valor 2||Real|||
|16|Valor 3||Real|||
|17|Valor 4||Real|||
|18|Valor 5||Real|||
|19|Fecha 1||Fecha|dd/mm/aa||
|20|Fecha 2||Fecha|dd/mm/aa||
|21|Fecha 3||Fecha|dd/mm/aa||
|22|Fecha 4||Fecha|dd/mm/aa||
|23|Fecha 5||Fecha|dd/mm/aa||
|24|Booleano 1||Booleano|Si=1/No=0|Parte Relacionada|
|25|Booleano 2||Booleano|Si=1/No=0||
|26|Booleano 3||Booleano|Si=1/No=0||
|27|Booleano 4||Booleano|Si=1/No=0||
|28|Booleano 5||Booleano|Si=1/No=0||
|29|Booleano 6||Booleano|Si=1/No=0||
|30|Booleano 7||Booleano|Si=1/No=0||
|31|Texto 1|||||
|32|Texto 2|||||
|33|Texto 3|||||


Lleva Tu Empresa Al **76**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No|Nombre de<br>Campo|Obl|Tipo de<br>Dato|Tamaño|Definición en Fiscal / Especificaciones|
|---|---|---|---|---|---|
|34|Lista Datos 9|X|Texto|5||
|35|Lista Datos 10||Texto|5||
|36|Alfanumérico 6||Alfanumérico|80||
|37|Alfanumérico 7||Alfanumérico|80||
|38|Alfanumérico 8||Alfanumérico|80||
|39|Alfanumérico 9||Alfanumérico|80||
|40|Alfanumérico 10||Alfanumérico|80||
|41|Valor 6||Real|||
|42|Valor 7||Real|||
|43|Valor 8||Real|||
|44|Valor 9||Real|||
|45|Valor 10||Real|||
|46|Fecha 6||Fecha|dd/mm/aa||
|47|Fecha 7||Fecha|dd/mm/aa||
|48|Fecha 8||Fecha|dd/mm/aa||
|49|Fecha 9||Fecha|dd/mm/aa||
|50|Fecha 10||Fecha|dd/mm/aa||
|51|Booleano 8||Booleano|Si=1/No=0||
|52|Booleano 9||Booleano|Si=1/No=0||
|53|Booleano 10||Booleano|Si=1/No=0||
|54|Texto 4|||||
|55|Texto 5|||||
|56|Texto 6|||||
|57|Texto 7|||||
|58|Texto 8|||||
|59|Texto 9|||||
|60|Texto 10|||||


**Los Campos sin Especificaciones NO son usados, pero se debe enviar su definición.**


Lleva Tu Empresa Al **77**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Especificaciones:**

**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 05,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 105,


Campo: GROUP_CATEGORY_s = APIOT


**Nota 3:**


Tipo de Registro:


Campo: Opción_i = 0 - “Nuevo Cliente”


Campo: Opción_i = 1 - “Actualización Cliente”


**Nota Varias** :

1) Si NO se usa el campo “TEXTO3_X”, se puede dejar en Blanco


**EJEMPLO SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
NumDoc_s, Local_origen, Local_destino, ORIGIN, IDConsulta_s **)**


**VALUES(** ‘05’,’AMERI’,’API’,1,’2’,‘192.168.181.233’, ’CL000072|A PRUEBAS
API|1711253573|||||||||||||0|0|0|MN|||||||08/03/2018|L||PRI||1||||||0|0|0|0|0|0||||||||0||||PF|
0||0|0|0||0||||’, ‘API-200’, ‘ARA’, ‘PRI’, ‘ARA’, ‘AMERI_ API-200’ **)**

**EJEMPLO Web Services Entrada:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘05’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’CL000072|A PRUEBAS
API|1711253573|||||||||||||0|0|0|MN|||||||08/03/2018|L||PRI||1||||||0|0|0|0|0|0||||||||0||||PF|
0||0|0|0||0||||’&NumDoc_s=‘API200’&Local_origen=‘ARA’&Local_destino=‘PRI’&ORIGIN=‘ARA’&IDConsulta_s=‘AMERI_ API-200’


**EJEMPLO:**


Lleva Tu Empresa Al **78**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|Campo|Datos|
|---|---|
|**CODE_s**|05|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**ORIGIN**|ARA|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|CL000072|A PRUEBAS<br>API|1711253573|||||||||||||0|0|0|MN|||||||08/03/2018|L||PRI||1||||||0|0|0|0<br>|0|0||||||||0||||PF|0||0|0|0||0|||||
|**TEXTO3_X**|||||||||||||||||||||||||||||||||
|**NumDoc_s**|API-200|
|**Local_origen**|ARA|
|**Local_destino**|PRI|
|**IDConsulta_s**|AMERI_ API-200|
|**Opcion_i**|0|


**EJEMPLO Web Services Salida:**


Hay 2 tipos de consulta a los APIs **por ID**   - por **código de grupo**, por ejemplo, para consultar los nuevos clientes
creados se consulta por el código de grupo 105 y el parámetro ap_int1=1 (1= No procesado, 0= Ya procesado)


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222&ap_code=105


Para consultar un ID especifico, se usa el parámetro “ap_id”:


192.168.181.140:9974/ **wsAPIS/api_read** ?ap_corp=ACME&ap_pass=12345678&ap_id=502542


Para más información, ver la última parte del Anexo E.


Lleva Tu Empresa Al **79**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN Y ACTUALIZACIÓN DE SUBCLIENTES


Para el proceso de creación y actualización de SubClientes se debe tener en cuenta que el código de operación es
“26” para el INGRESO DE INFORMACION hacia el producto de Software


Además, los datos asignados en los campos del Web Services o la tabla “SIST_API” son:


**Datos de Cabecera:**

|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código de Cliente|X|8|Alfanumérico||
|2|Código de Sub Cliente|X|8|Alfanumérico||
|3|Nombre|X|80|Alfanumérico||
|4|Identificación||15|Alfanumérico||
|5|Límite Ventas|||Real||
|6|Identificación Fiscal|X|15|Alfanumérico|Identificación Fiscal|
|7|Dirección 1||80|Alfanumérico||
|8|Dirección 2||80|Alfanumérico||
|9|Dirección 3||80|Alfanumérico||
|10|Código Zip||10|Alfanumérico||
|11|Télefono1||14|Alfanumérico||
|12|Télefono2||14|Alfanumérico||
|13|Fax||14|Alfanumérico||
|14|Email||50|Alfanumérico||
|15|Código País||8|Alfanumérico|Relacional|
|16|Código Provincia/Estado||8|Alfanumérico|Relacional|
|17|Código Ciudad||8|Alfanumérico|Relacional|
|18|Código Sector||5|Alfanumérico|Relacional|
|19|Referencia||20|Alfanumérico||
|20|Memo General|||Texto||
|21|Alerta en Factura||0|Booleano|0 = False / 1 = True|
|22|Definible Numérico 1|||Real||



Lleva Tu Empresa Al **80**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|23|Definible Numérico 2|||Real||
|24|Definible Fecha 1||00/00/00|Fecha||
|25|Definible Fecha 2||00/00/00|Fecha||
|26|Definible Texto 1||20|Alfanumérico||
|27|Definible Texto 2||20|Alfanumérico||
|28|Municipio||30|Alfanumérico||
|29|Colonia||60|Alfanumérico||
|30|Localidad||60|Alfanumérico||
|31|No. Interior||10|Alfanumérico||
|32|No. Exterior||10|Alfanumérico||
|33|Memo Despachos|||Texto||
|34|Código de Régimen Fiscal||5|Texto|Relacionado|
|35|Código de Cliente Nuevo||8|Texto|Solo si cambia la Relación del<br>Cliente Original y si es<br>Actualización.|


**Especificaciones:**


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 26,


Campo: GROUP_CATEGORY_s = API


**Nota 2:**


Tipo de Registro:


Campo: Opción_i = 0 - “Nuevo SubCliente”


Campo: Opción_i = 1 - “Actualización SubCliente”





Lleva Tu Empresa Al **81**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
NumDoc_s, Local_origen, Local_destino, ORIGIN, IDConsulta_s **)**


**VALUES(** ‘05’,’AMERI’,’API’,1,’2’,‘192.168.181.233’, ‘Datos de Trama’, ‘API-200’, ‘ARA’, ‘PRI’, ‘ARA’, ‘AMERI_ API200’ **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘05’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=‘Datos de
Trama’&NumDoc_s=‘API-200’&Local_origen=‘ARA’&Local_destino=‘PRI’&ORIGIN=‘ARA’&IDConsulta_s=‘AMERI_
API-200’


**EJEMPLO:**







|Campo|Datos|
|---|---|
|**CODE_s**|26|
|**CORP_s**|ACME|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**ORIGIN**|PRI|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|148e6237|SCLI001|MARQUEZ ABAD JOSTIN<br>ALEXANDER|1727893180||1727893180|D1|D2|D3|ZIP|T1|T2|F1|EMAIL|||||<br>REF|MEMO|0|||00/00/00|00/00/00|||||||||CI||
|**NumDoc_s**|SCLI-100|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**IDConsulta_s**|ACME_ SCLI-100|
|**Opcion_i**|0|


Lleva Tu Empresa Al **82**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE COTIZACIONES


Información necesaria para registrar datos de Cotizaciones vía API.


**Datos de Cabecera:**







|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número Cotización|X|20|Alfanumérico|Referencial|
|2|Código Cliente|X|8|Alfanumérico|Campo Relacionado|
|3|Fecha Emisión|X||Date|Formato “dd/mm/aa”|
|4|Fecha Validez|X||Date|Formato "dd/mm/aa"|
|5|Código de SubClientes||8|Alfanumérico|Campo Relacionado|
|6|Código Vendedor||5|Alfanumérico|Campo Relacionado|
|7|Código Moneda|X|2|Alfanumérico|Campo Relacionado|
|8|Código Bodega|X|3|Alfanumérico|Campo Relacionado|
|9|Pedido Manual|||||
|10|Número Contrato|||||
|11|Orden Compra|||||
|12|Transportista|||||
|13|Medio Captura|||||
|14|Nombre Solicitante|||||
|15|Memo|||||


Lleva Tu Empresa Al **83**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**










|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número Cotización|X|20|Alfanumérico|Referencial|
|2|Secuencial Posición|X||Entero||
|3|Código del Producto|X|20|Alfanumérico|Campo Relacionado|
|4|Cantidad del Producto|X||Real||
|5|Precio del Producto|X||Real||
|6|% Descuento de Producto|||Real|Porcentaje de Descuento<br>No se Realiza Cálculos del Campo.|
|7|Aplica Impuesto 1|||Booleano|1 = Aplica Impuesto 1.<br>0 = No Aplica Impuesto 1.|
|8|Código Impuesto 1||5|Alfa|Si Aplica y es el General – Blanco.|
|9|Total de Producto|X||Real|No se Realiza Cálculos del Campo,<br>Corresponde al Valor Sin<br>Impuestos.|
|10|Campos Adicionales Producto|||Texto|Se debe enviar los campos: Text1;<br>Texto2; Texto3; Fecha1; Fecha2;<br>Fecha3; Valor1; Valor2; Valor3.<br>Si no envía dejar en blanco.|
|11|Memo de Producto|||Texto||



**Nota 1:** El código de operación para este proceso de Entrada de Datos es **“28”**


**Nota 2:** Opciones del campo “Opcion_i” por defecto se asignará el valor Cero, valida al precio los Productos.


0: Cotización en Ver / Editar


1: Cotización Confirmada.


Lleva Tu Empresa Al **84**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, Opcion_i, INTEGER_4, NumDoc_s, Local_origen, Local_destino, ORIGIN, IDConsulta_s **)**


**VALUES(** ‘28’, ’AMERI’, ’API’, 1, ’2’, ‘192.168.181.233’, ‘TRAMA CABECERA’, ‘TRAMA DETALLE’, 0, 0, ‘PED-100’,
‘PRI’, ‘PRI’, ‘PRI’, ‘AMERI_200’ **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘28’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=‘TRAMA
CABECERA’&TEXTO3_X=‘TRAMA DETALLE’&Opcion_i=0&INTEGER_4=0&NumDoc_s=‘PED100’&Local_origen=‘PRI’&Local_destino=‘PRI’&ORIGIN=‘PRI’&IDConsulta_s=‘AMERI_200’


**EJEMPLO:**

|Campo|Datos|
|---|---|
|**CORP_s**|AMERI – CODIGO EMPRESA|
|**ORIGIN**|PRI – CODIGO SUCURSAL|
|**GROUP_CATEGORY_s**|API|
|**CODE_s**|28|
|**INTEGER_1**|1|
|**TEXTO1_10**|1|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|100|CLI001|06/02/2019|15/02/2019||VEN01|US|B01|PM123|CO456|OC789<br>|TR001||SOLICITANTE|Memo|
|**TEXTO3_X**|100|1|PROD001|1|10|0|0||10||Memo|
|**Opcion_i**|1|
|**NumDoc_s**|COT-100|
|**IDConsulta_s**|AMERI-COT-100|



Lleva Tu Empresa Al **85**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE PEDIDOS DE CLIENTES


Para realizar el proceso de creación de pedidos a través de datos externos es decir **Web Services u ODBC**, se debe
tener muy en cuenta la siguiente información que es necesaria y su orden correspondiente.


**Datos de Cabecera:**

|No.|Nombre Campo|Obl|Tamaño Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número Pedido Cliente|X|20|Alfanumérico|Referencial|
|2|Código Cliente|X|8|Alfanumérico|Campo Relacionado|
|3|Fecha Emisión Pedido|X||Date|Formato “dd/mm/aa”|
|4|Fecha Entrega Pedido|X||Date|Formato "dd/mm/aa"|
|5|Código Vendedor||5|Alfanumérico|Campo Relacionado|
|6|Código Moneda|X|2|Alfanumérico|Campo Relacionado|
|7|Código Bodega|X|5|Alfanumérico|Campo Relacionado|
|8|Código Empresa|X|5|Alfanumérico|Campo Relacionado|
|9|Nombre Sub-Cliente||30|Alfanumérico||
|10|Teléfono del Sub-Cliente||14|Alfanumérico||
|11|Dirección del Sub-Cliente||80|Alfanumérico||
|12|Identificación del Sub-Cliente||15|Alfanumérico||
|13|Código del Sub-Cliente||8|Alfanumérico||
|14|Identificación Sub-Cliente||15|Alfanumérico||
|15|Referencias del Sub-cliente||60|Alfanumérico||
|16|Código Sucursal|X|3|Alfanumérico|Campo Relacionado|
|17|Memo|||Texto||
|18|Código de transportista||5|Alfanumérico||
|19|Nombre Solicitante||20|Alfanumérico||



Lleva Tu Empresa Al **86**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**













|No.|Nombre Campo|Obl|Tamaño Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número del Pedido||20|Alfanumérico|Referencial|
|2|Código del Producto|X|20|Alfanumérico|Campo Relacionado|
|3|Cantidad del Producto|X||Real||
|4|Precio del Producto|X||Real||
|5|Descuento por Línea del Producto|||Real||
|6|En Detalle aplica Impuesto 1-IVA|||Booleano|1 = Tiene IVA; 0 = No tiene IVA.|
|7|Secuencial Posición|||Entero||
|8|Unidades Gratis|||Real||
|9|Fecha Ingreso Producto al Pedido|||Date|Formato "dd/mm/aa"|
|10|En Detalle aplica Impuesto 2-IPES|||Booleano|1 = Tiene IVA; 0 = No tiene IVA.|
|11|Código de Impuesto 2-IPES|||Texto|En Blanco = Impuesto General|
|12|Precio Solicitado|||Real||
|13|Descuento Solicitado|||Real||
|14|Campos Adicionales del Detalle|||Texto|Se debe enviar los campos: Text1;<br>Texto2; Texto3; Fecha1; Fecha2;<br>Fecha3; Valor1; Valor2; Valor3.<br>Si no envía dejar en blanco.|
|15|Memo Solicitud de Requisición|||Texto||
|16|Aplica Promoción|||Entero|1=Aplica, 0=NO Aplica|
|17|Código Promoción|||Texto|Código de Promoción Aplicada, si no<br>lleva dejar en blanco o si el campo<br>anterior es cero.|
|18|Cantidad Original Promoción|||Real|Para uso Interno, Poner 0|
|19|El Precio incluye Impuesto|||Entero|Precio Incluye Impuesto:<br>1=SI / 0=NO|
|20|Código Precio Alterno|||Entero||
|21|Tipo de Precio|||Texto|Blanco = Si usa precio de Ficha<br>M = Si usa precio de trama|
|22|Precio de Venta Original|||Real||


Lleva Tu Empresa Al **87**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|23|Valor de Descuento del Cliente|Col3|Col4|Real|Col6|
|---|---|---|---|---|---|
|24|Valor de Descuento Max. por línea|||Real||
|25|Valor de Descuento x Grupo|||Real||
|26|Precio Final con Descuento|||Real||


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 01,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 101,


Campo: GROUP_CATEGORY_s = APIOT

**Nota 2:** Para el proceso de Pedidos el valor del precio puede ser validado o no, en el caso de ser validado no
permitirá que este valor sea cero por lo que obliga a que se envíe un valor, caso contrario el sistema tomará uno
de estos valores:

     - Negociado

     - Mayorista

     - Lista de Precio

**Nota 3:** Tome en cuenta que el campo “Opcion_i” por defecto se asignará el valor Cero, valida al precio los
Productos.

1: Verifica Precios
2: No valida Precios, valor por defecto.

**Nota 4:** Tome en cuenta que el campo “INTEGER_6:

0: Documento en Ver / Editar
1: Documento Confirmado.

**Nota 5:** Para el manejo de los impuestos o grupos de impuestos:


    - Si el sistema detecta en los campos **“Aplica IVA”** tienen valor “ **0** ”, el sistema no aplicará el impuesto a
este producto

    - Si el sistema detecta en los campos **“Aplica IVA”** tienen valor “ **1** ”, el sistema aplicará el impuesto a este
producto y la jerarquía se aplicará de acuerdo a la parametrización del Producto de Software.

**Nota 6:** La jerarquía para aplicar impuestos es la siguiente:

    - Si en la ficha del producto en el grupo de impuesto se asigna un tipo de impuesto y es diferente a
“ **General** ”, se aplicará este impuesto.


Lleva Tu Empresa Al **88**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


de impuesto en la ficha del Cliente, si lo tiene, se procederá aplicar este impuesto; caso contrario el
sistema verificará si tiene asignado un grupo de impuesto en la sucursal de ser esto verdadero aplicará
este impuesto, caso contrario aplicará el impuesto asignado a nivel de empresa.


Lleva Tu Empresa Al **89**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**

**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, Opcion_i, INTEGER_4, NumDoc_s, Local_origen, Local_destino, ORIGIN, IDConsulta_s **) VALUES(** ‘01’,
’AMERI’, ’API’, 1, ’2’, ‘192.168.181.233’, ‘TRAMA CABECERA’, ‘TRAMA DETALLE’, 0, 0, ‘PED-100’, ‘PRI’, ‘PRI’, ‘PRI’,
‘AMERI_200’ **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘01’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=‘TRAMA
CABECERA’&TEXTO3_X=‘TRAMADETALLE’&Opcion_i=0&INTEGER_4=0&NumDoc_s=‘PED100’&Local_origen=‘PRI’&Local_destino=‘PRI’&ORIGIN=‘PRI’&IDConsulta_s=‘AMERI_200’

**EJEMPLO:**

|Campo|Datos|
|---|---|
|**CODE_s**|01|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|100|PRI30002|22/03/12|22/03/12||US|GEN|TEPRI||||||||PRI|Memo|||
|**TEXTO3_X**|100|KM1|2|10|0|1|1|0|00/00/00|0||0|0||Memo|0|||<br>100|KM2|2|0|0|1|1|0|00/00/00|0||0|0||Memo|1|PROM001|1|
|**Opcion_i**|1|
|**INTEGER_6**|0|
|**NumDoc_s**|PED-100|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**IDConsulta_s**|AMERI_200|



**EJEMPLO Web Services Salida:**


Consulta de nuevos pedidos sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222&ap_code=101&ap_int1=1
Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **90**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE REMISIONES CONFIRMADAS


Para realizar remisiones a través de Fuentes externas con conexiones **Web Services o ODBC**, se debe tener muy
en cuenta el proceso que se realiza en el Producto de Software.


El proceso de remisiones consiste en la creación del documento principal (remisiones) en estado; Confirmadas,
estas últimas entran en la cola de impresión.


**Datos de Cabecera:**

















|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Remisión|X||Real|Si es confirmada el número debe<br>ser obligatorio, caso contrario<br>enviar cero|
|2|Código del Cliente|X|8|Alfanumérico||
|3|Fecha Emisión de la Remisión|X||Date|Formato "dd/mm/aaaa"|
|4|Fecha de Vencimiento Remisión|||Date|Formato "dd/mm/aaaa"|
|5|Nombre Sub-Cliente||30|||
|6|Código del Vendedor|X|5|Alfanumérico|Campo Relacionado|
|7|Código de la Moneda|X|2|Alfanumérico|Campo Relacionado|
|8|Valor Cotización de la Moneda|||Real|Si es diferente a la del Sistema|
|9|Código de la Bodega|X|5|Alfanumérico|Campo Relacionado|
|10|Descuento de la Remisión|||Real||
|11|Código de la Sucursal|X|3|Alfanumérico|Campo Relacionado|
|12|Número de la Caja|||Entero||
|13|Teléfono del Sub-Cliente||10|Alfanumérico||
|14|Dirección del Sub-Cliente||30|Alfanumérico||
|15|Identificación del Sub-Cliente||15|Alfanumérico||
|16|Código del Sub-Cliente|||Entero||
|17|Documento Identificación Sub-<br>Cliente||15|Alfanumérico||
|18|Referencias del Sub-Cliente||20|Alfanumérico||


Lleva Tu Empresa Al **91**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|19|Multidimensión||80|Alfanumérico|Conjunto de datos separados y<br>terminados en (;) Departamento;<br>Centro de Costo; Proyecto; Sub-<br>Proyecto; Análisis 1; Análisis 2;<br>Análisis 3; Memo Proyecto;|
|20|Memo Factura|||Texto||
|21|Número Pedido|||Entero|Corresponde al número de<br>pedido generado en el sistema|



Lleva Tu Empresa Al **92**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**












|c|Nombre Campo|Obl|Tamaño Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Remisión|X||Real||
|2|Código del Producto|X|20|Alfanumérico|Campo Relacionado|
|3|Cantidad|X||Real||
|4|Precio Unitario negociado|X||Real|Si envía este valor en la trama es<br>el valor que corresponde al<br>precio por unidad, si no envía el<br>mismo hará la división con el<br>valor enviado en el total de línea.|
|5|Cantidad Unidades Gratis|||Real||
|6|Aplica Impuesto 1|X||Entero|1 = Aplica / 0 = No Aplica.|
|7|Tamaño|||Real|En información adicional|
|8|Valor del Peso|||Real|En información adicional|
|9|Valor del Peso Neto|||Real|En información adicional|
|10|Color del Producto||||En información adicional|
|11|Grosor del Producto||||En información adicional|
|12|Identificación||||En información adicional|
|13|Observaciones||||En información adicional|
|14|Información Adicional|||Texto||
|15|Referencias al Campo Adicional 1|||Texto|En información adicional TEXTO 1|
|16|Referencias al Campo Adicional 2|||Texto|En información adicional TEXTO 2|
|17|Referencias al Campo Adicional 3|||Texto|En información adicional TEXTO 3|
|18|Referencia al Campo Numérico 1|||Real|En información adicional VALOR 1|
|19|Referencia al Campo Numérico 2|||Real|En información adicional VALOR 2|
|20|Referencia al Campo Numérico 3|||Real|En información adicional VALOR 3|
|21|Referencia al Campo tipo Fecha 1|||Date|En información adicional|
|22|Referencia al Campo tipo Fecha 2|||Date|En información adicional|
|23|Referencia al Campo tipo Fecha 3|||Date|En información adicional|
|24|Multidimensión||80|Alfanumérico|Conjunto de datos separados y<br>terminados en (;) Departamento; Centro<br>de Costo; Proyecto; Sub-Proyecto;<br>Análisis 1; Análisis 2; Análisis 3; Memo<br>Proyecto;|



Lleva Tu Empresa Al **93**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|25|Código del Impuesto 1|Col3|Col4|Col5|Campo Relacionado, Blanco si es<br>el Impuesto General.|
|---|---|---|---|---|---|
|26|Aplica Impuesto 2|||Entero|1 = Aplica / 0 = No Aplica.|
|27|Código del Impuesto 2||||Campo Relacionado, Blanco si es<br>el Impuesto General.|
|28|Aplica Impuesto 3|||Entero|1 = Aplica / 0 = No Aplica.|
|29|Código del Impuesto 3||||Campo Relacionado, Blanco si es<br>el Impuesto General.|
|30|Aplica Impuesto 4|||Entero|1 = Aplica / 0 = No Aplica.|
|31|Código del Impuesto 4||||Campo Relacionado, Blanco si es<br>el Impuesto General.|
|32|Aplica Impuesto  5|||Entero|1 = Aplica / 0 = No Aplica.|
|33|Código del Impuesto 5||||Campo Relacionado, Blanco si es<br>el Impuesto General.|
|34|Descuento x Línea|||Real|Valor del Porcentaje de<br>Descuento|
|35|Lote Ubicación y Valor||||Datos separados por punto y<br>coma (;)<br>La estructura un lote es: <br>Lote1; cantidad1; ubicación1;<br>cantidad1<br>La estructura varios lotes es: <br>Lote1; cantidad1; ubicación1;<br>cantidad1;<br>Lote2; cantidad2; ubicación2;<br>cantidad2|
|36|Total Neto de la Línea de detalle|||Real|Si envía este valor en la trama<br>este valor será dividido para la<br>cantidad y tomara el valor<br>unitario independiente de lo<br>enviado en ese campo.|



Lleva Tu Empresa Al **94**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 22,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 122,


Campo: GROUP_CATEGORY_s = APIOT


**Nota 2** : La remisión ingresa como confirmada por lo tanto el campo “Opción_i” debe estar asignado el valor CERO
(0).


**Nota 3** : Toda remisión CONFIRMADA, siempre entra en la cola de impresión.


**Nota 4:** Para el manejo de los impuestos o grupos de impuestos:


      - Si el sistema detecta en el campo “ **Tiene iva o “Impuesto** X **”** (X, valor de 2 a 5) tienen valor “ **VACIO** ”,
el sistema tomará la parametrización establecida en el Producto de Software.


      - Si el sistema detecta en los campos “ **Tiene iva” o “Impuesto** X **”** (X, valor de 2 a 5) tienen valor “ **1** ”, el
sistema aplicará el impuesto a este producto y la jerarquía se aplicará de acuerdo a la parametrización
del Producto de Software.


      - Si el sistema detecta en los campos “ **Tiene iva” o “Impuesto** X **”** (X, valor de 2 a 5) tienen valor “ **0** ”, el
sistema no aplicará el impuesto a este producto.


**Nota 5:** La jerarquía para aplicar impuestos es la siguiente:


      - Si en la ficha del producto en el grupo de impuesto se asigna un tipo de impuesto y es diferente a
“ **General** ”, se aplicará este impuesto.


      - Si en la ficha de producto el tipo de impuesto es **“General”**, el sistema verificará si tiene asignado un
tipo de impuesto en la ficha del Cliente, si lo tiene, se procederá aplicar este impuesto; caso contrario
el sistema verificará si tiene asignado un grupo de impuesto en la sucursal de ser esto verdadero
aplicará este impuesto, caso contrario aplicará el impuesto asignado a nivel de empresa.


Lleva Tu Empresa Al **95**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 6:** Los códigos y valores enviados(no necesarios) en los campos **“Código del impuesto X; “Porcentaje del**
**impuesto X”** serán validados en el Producto de Software, si existen y corresponden los valores se aplicarán estos
a la operación caso contrario si detecta vacío, el sistema lo tomará de la parametrización del Producto de Software
respetando la jerarquía del sistema.


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, NumDoc_s; Origin; Local_Destino; Local_Origen; IDConsulta_s; Opcion_i **)**


**VALUES(** ‘22’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,’
100|019978|17/10/2013|17/10/2013|||MN|0|SEL|0|PRI||||||||;;;;;;;|MEMO|101’,’
100|RP1|1|111.00|0|0|||||||observaciones|||||||||||;;;;;;;||||||||||||111.00|100|RP2|1|211.00|0|0|||
||||observaciones2|||||||||||;;;;;;;||||||||||||211.00’,‘9’; ‘PRI‘, ‘PRI’, ‘PRI‘, ‘DERMAARA009’;0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘22’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’
100|019978|17/10/2013|17/10/2013|||MN|0|SEL|0|PRI||||||||;;;;;;;|MEMO|101’&TEXTO3_X=’
100|RP1|1|111.00|0|0|||||||observaciones|||||||||||;;;;;;;||||||||||||111.00|100|RP2|1|211.00|0|0|||
||||observaciones2|||||||||||;;;;;;;||||||||||||211.00’&NumDoc_s; Origin; Local_Destino; Local_Origen;
IDConsulta_s; Opcion_i=‘9’; ‘PRI


Lleva Tu Empresa Al **96**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Ejemplo de Remisiones:**

|Campo|Datos|
|---|---|
|**CODE_s**|22|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**ORIGIN**|PRI|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|100|019978|17/10/2013|17/10/2013|||MN|0|SEL|0|PRI||||||||;;;;;;;|MEMO<br>|101|
|**TEXTO3_X**|100|RP1|1|111.00|0|0|||||||observaciones|||||||||||;;;;;;;||||||||||||111.<br>00|100|RP2|1|211.00|0|0|||||||observaciones2|||||||||||;;;;;;;||||||||||||<br>211.00|
|**NumDoc_s**|9|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**IDConsulta_s**|AMERI_9|
|**Opcion_i**|0|



**Ejemplo Web Services Salida:**


Consulta de Remisiones Confirmadas, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=122** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **97**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE FACTURAS DE CLIENTES CONFIRMADAS O VER / EDITAR


Para realizar la facturación a través de Fuentes externas con conexiones **Web Services o ODBC**, se debe tener muy
en cuenta el proceso que se realiza en el Producto de Software.


El proceso de facturación consiste en la creación del documento principal (Factura) en tres estados:


CONFIRMADAS (Opcion_i=0)


VER-EDITAR (Opcion_i=1)


VER-EDITAR – CONFIRMACION AUTOMATICA (Opcion_i=2)


**Datos de Cabecera:**












|No.|Nombre Campo|Obl|Tamaño|Tipo de<br>Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Código Cliente|X|8|Alfanumérico|Campo Relacionado|
|3|Fecha Emisión Factura|||Date|Formato: dd/mm/aa|
|4|Fecha Vencimiento Factura|||Date|Formato: dd/mm/aa|
|5|Identificación||15|Alfanumérico|Identificación Fiscal|
|6|Nombre Sub-Cliente||30|Alfanumérico|Campo Relacionado|
|7|Código Vendedor||5|Alfanumérico|Campo Relacionado|
|8|Código Moneda||2|Alfanumérico|Campo Relacionado|
|9|Valor de la Cotización|||Real|Si es diferente a la del Sistema|
|10|Número de Pagos Factura|||Entero|Por defecto 1|
|11|Código de la Bodega||3|Alfanumérico|Campo Relacionado|
|12|Descuento de la Factura|||Real||
|13|Código del Sucursal||3|Alfanumérico||
|14|Código de la Caja||3|Alfanumérico|Si la parametrización del manejo de<br>secuenciales es por sucursal debe ir<br>999 caso contrario el código de la caja.|
|15|Vendedor comisiona|||Booleano||
|16|Teléfono Sub-Cliente||10|Alfanumérico||
|17|Dirección del Sub-Cliente||30|Alfanumérico||
|18|Identificación del Sub-Cliente||15|Alfanumérico||



Lleva Tu Empresa Al **98**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño|Tipo de<br>Dato|Especificaciones|
|---|---|---|---|---|---|
|19|Código del Sub-Cliente|||Entero||
|20|Documento Identificación del<br>Sub-Cliente||15|Alfanumérico|Identificación Fiscal|
|21|Referencias del Sub-Cliente||20|Alfanumérico||
|22|Origen (Código del Sucursal)|X|3|Alfanumérico|Código de la Sucursal Origen de la<br>Factura, igual campo 13|
|23|Tipo de Documento|X|5|Alfanumérico|Al enviar el campo vacío el sistema lo<br>interpretará como documento Factura|
|24|Multidimensión||15|Alfanumérico|Códigos separados y terminados en (;)<br>en el siguiente orden: Departamento;<br>Centro de Costo; Proyecto;<br>Subproyecto; Análisis 1; Análisis 2;<br>Análisis 3; Memo Proyecto;|
|25|Pago en Venta|||Booleano||
|26|Memo Factura|||Texto||
|27|Imprimir Campo Memo en<br>Factura|||Booleano||
|28|Número de Aprobación|||Alfanumérico|Emitido por el Ente Controlador (SRI)|
|29|Fecha Caducidad|||Date|Emitido por el Ente Controlador (SRI)|


**NOTA:**


En el caso de usar: VER-EDITAR – CONFIRMACION AUTOMATICA (Opcion_i=2), se debe considerar las siguientes
Observaciones:


1. El campo 1: Número Factura, este valor es un Identificador único de la factura este campo se almacenará

en un campo referencial de la factura, al registrar esta información será validad su existencia en la base
de datos.


2. El campo 22: Tipo de Documento, en este campo se debe registrar el dato del tipo de documento

relacionado a la factura.


3. Si las validaciones son correctas, se procederá a confirmar el documento si en el proceso de confirmación

se marca algún error el registro quedará en Ver/Editar.


Lleva Tu Empresa Al **99**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**






|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Código del Producto|X||Real||
|3|Cantidad a Facturar|||Real||
|4|Precio Unitario|||Real||
|5|Número de Unidades Gratis|||Real||
|6|Detalle con IVA|||Booleano||
|7|Porcentaje de Descuento por Detalle|||Real||
|8|Tamaño|||Real||
|9|Valor del Peso|||Real||
|10|Valor del Peso Neto|||Real||
|11|Color del  Producto|||Alfanumérico||
|12|Grosor del Producto|||Real||
|13|Identificación|||Alfanumérico||
|14|Observaciones|||Texto||
|15|Información Adicional|||Texto||
|16|Referencia Campo Adicional 1|||Alfanumérico|En Información Adicional TEXTO 1|
|17|Referencia Campo Adicional 2|||Alfanumérico|En Información Adicional TEXTO 2|
|18|Referencia Campo Adicional 3|||Alfanumérico|En Información Adicional TEXTO 3|
|19|Referencia Campo Numérico 1|||Real|En Información Adicional VALOR 1|
|20|Referencia Campo Numérico 2|||Real|En Información Adicional VALOR 2|
|21|Referencia Campo Numérico 3|||Real|En Información Adicional VALOR 3|
|22|Referencia Campo de Tipo Fecha 1|||Fecha|En Información Adicional|
|23|Referencia Campo de Tipo Fecha 2|||Fecha|En Información Adicional|
|24|Referencia Campo de Tipo Fecha 3|||Fecha|En Información Adicional|
|25|Multidimensión por Detalle|X||Booleano|Códigos separados y terminados en (;)<br>en el siguiente orden: Departamento;<br>Centro de Costo; Proyecto;<br>Subproyecto; Análisis 1; Análisis 2;<br>Análisis 3; Memo Proyecto;|
|26|Impuesto 2|||Booleano||
|27|Impuesto 3|||Booleano||



Lleva Tu Empresa Al **100**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|28|Impuesto 4|Col3|Col4|Booleano|Col6|
|---|---|---|---|---|---|
|29|Impuesto 5|||Booleano||
|30|Código del Impuesto 1|||Alfanumérico|Campo Relacionado|
|31|Porcentaje del Impuesto 1|||Real||
|32|Código del Impuesto 2|||Alfanumérico|Campo Relacionado|
|33|Porcentaje del Impuesto 2|||Real||
|34|Código del Impuesto 3|||Alfanumérico|Campo Relacionado|
|35|Porcentaje del Impuesto 3|||Real||
|36|Código del Impuesto 4|||Alfanumérico|Campo Relacionado|
|37|Porcentaje del Impuesto 4|||Real||
|38|Código del Impuesto 5|||Alfanumérico|Campo Relacionado|
|39|Porcentaje del Impuesto 5|||Real||
|40|Lote y Ubicación|||Texto|Separados con (;)<br>Lote;Cantidad;<br>Ubicación1;Cantidad1;<br>Ubicación2;Cantidad2|
|41|Total Neto de la Línea de Detalle|||Real||



Esta factura puede tener detalle de cuotas, datos no necesarios para facturas PENDIENTES A CONFIRMAR y los
datos transmitidos son:


**Datos de Cuotas:**

|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Fecha de Pago de la Cuota|||Fecha|Formato: DD/MM/AAAA|
|3|Valor de la Cuota|||Real||
|4|Número de Días de Pago||||En el caso de ser a Crédito|
|5|Porcentaje||||En el caso de ser a Crédito|



Lleva Tu Empresa Al **101**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Información Adicional (ABC):**





|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Pedido Manual||20|Alfanumérico||
|3|Fecha Pedido Manual|||Fecha|Formato: DD/MM/AAAA.|
|4|Orden de Compra Cliente||20|Alfanumérico||
|5|Fecha Orden de Compra|||Fecha|Formato: DD/MM/AAAA.|
|6|Recibo Entrega Mercadería||20|Alfanumérico||
|7|Fecha Recibo Entrega Mercadería|||Fecha|Formato: DD/MM/AAAA.|
|8|Variable Adicional 1 (*)||20|Alfanumérico||
|9|Variable Adicional 2 (*)||20|Alfanumérico||
|10|Variable Adicional 3 (*)||50|Alfanumérico||
|11|Variable Adicional 4 (*)||50|Alfanumérico||
|12|Variable Adicional 5 (*)||50|Alfanumérico||
|13|Variable Adicional 6 (*)||50|Alfanumérico||
|14|Uso de Documento Digital||5|Alfanumérico|Código Relacional ingresado en MBA|
|15|Tipo de Relación de Documento||5|Alfanumérico|Código Relacional ingresado en MBA|
|16|Documento Relacionado||20|Alfanumérico|Número de Factura Afectada|
|17|Tipo Documento Relacionado||5|Alfanumérico|Tipo de Documento Relacionado|
|18|Referencia Única Interna||10|Alfanumérico|Identificación Única de Ventas|
|19|Tipo de Exportación||5|Alfanumérico|Código Relacional ingresado en MBA|


(*) Estos campos varían el nombre en función de la aplicación en el manejo de las Addendas, en MBA3 el orden
se maneja de izquierda - derecha y de arriba – abajo, es necesario verificar los manuales de las adendas para
determinar los campos obligatorios.


Esta Información se almacena en el campo **TEXTO7_X** y es obligatorio, si no pasa datos dejar los pipe, los
campos 14 / 15/ 16, se usan en Emisión Digital CFDI 3.3 (México).


Si se pasa en blanco, el campo 14 toma el dato de “G01”, que es un general en el catálogo del SAT.


Los campos 15 y 16, son obligatorios los 2 y se los toma datos de una Factura de Anticipo.


El campo 17 es obligatorio para identificar el tipo de documento a usar.


Lleva Tu Empresa Al **102**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**DATOS FISCALES – La Definición se basa en la dada en el Sistema. País: ECUADOR.**

|No|Nombre de<br>Campo|Obl|Tipo de Dato|Tamaño|Definición en Fiscal / Especificaciones|
|---|---|---|---|---|---|
|1|Lista Datos 1||Texto|5|Distrito Aduanero|
|2|Lista Datos 2||Texto|5|Régimen|
|3|Lista Datos 3||Texto|5|Tipo de Documento|
|4|Lista Datos 4||Texto|5|Términos de la Factura|
|5|Lista Datos 5||Texto|5|País Adquisición|
|6|Lista Datos 6||Texto|5|País Origen|
|7|Lista Datos 7||Texto|5|Forma de Pago|
|8|Lista Datos 8||Texto|5|Tipo de Exportación (Refrendo)|
|9|Alfanumérico 1||Alfanuméric<br>o|80|Año|
|10|Alfanumérico 2||Alfanuméric<br>o|80|Correlativo|
|11|Alfanumérico 3||Alfanuméric<br>o|80|Verificador|
|12|Alfanumérico 4||Alfanuméric<br>o|80|Documento Transporte|
|13|Alfanumérico 5||Alfanuméric<br>o|80|Lugar de Inicio|
|14|Valor 1||Real|||
|15|Valor 2||Real|||
|16|Valor 3||Real|||
|17|Valor 4||Real|||
|18|Valor 5||Real|||
|19|Fecha 1||Fecha|dd/mm/aa|Fecha Embarque|
|20|Fecha 2||Fecha|dd/mm/aa||
|21|Fecha 3||Fecha|dd/mm/aa||
|22|Fecha 4||Fecha|dd/mm/aa||
|23|Fecha 5||Fecha|dd/mm/aa||
|24|Booleano 1||Booleano|Si=1/No=0|Factura de Exportación: SI=1 / NO=0|



Lleva Tu Empresa Al **103**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|25|Booleano 2|Col3|Booleano|Si=1/No=0|Refrendo: SI=1 / NO=0|
|---|---|---|---|---|---|
|26|Booleano 3||Booleano|Si=1/No=0|No Reportable: SI=1 / NO=0|
|27|Booleano 4||Booleano|Si=1/No=0|Exportación a Paraíso Fiscal: SI=1 / NO=0|
|28|Booleano 5||Booleano|Si=1/No=0|El Ingreso del Exterior Gravado con IR: SI=1 /<br>NO=0|
|29|Booleano 6||Booleano|Si=1/No=0||
|30|Booleano 7||Booleano|Si=1/No=0||
|31|Texto 1||||Denominación del Régimen Fiscal Preferente o<br>Jurisdicción de Menor Imposición|
|32|Texto 2||||Puerto Embarque|
|33|Texto 3||||Puerto Destino|


**Los Campos sin Especificaciones NO son usados, pero se debe enviar su definición.**


Lleva Tu Empresa Al **104**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Este esquema y orden son necesarios tener presente en el momento de almacenar la información en la base de
datos (BDD) de nuestro producto para registrar las transacciones de facturas.


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 04,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 104,


Campo: GROUP_CATEGORY_s = APIOT


**Nota 2:** Para el caso de ingresar FACTURAS PENDIENTES A CONFIRMAR, el campo **“Opcion_i”** debe estar asignado
el valor UNO(1).


**Nota 3** : Todos los campos numéricos al no tener un valor, por defecto es necesario enviar CERO. Los campos de
tipo Fecha que no tengan asignado un valor y no sean obligatorios es necesario enviar el valor por defecto
“00/00/00”, los campos de tipo BOOLEANO 0: Falso ó 1: Verdadero


**Nota 5** : Sólo en las facturas “NO CONFIRMADAS” permitirá enviar el número del documento con CERO y se
manejará el campo **“Opcion_i”**


**Nota 6** : Si la operación se utiliza con el código “ **04** ”, no es necesario enviar el API de cobros “ **02** ”, ya que el proceso
confirma y realiza el cobro con los datos enviados.


**Nota 7** : Toda factura NO CONFIRMADA, siempre entra en la cola de impresión.


**Nota 8** : En facturas NO CONFIRMADAS, no es necesario enviar la cuota de pago.


**Nota 9:** Para el manejo de los impuestos o grupos de impuestos:


Si el sistema detecta en el campo “Tiene iva” o “Impuesto X” (X, valor de 2 a 5) tienen valor “VACIO”, el sistema
tomará la parametrización establecida en el Producto de Software.


Lleva Tu Empresa Al **105**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Si el sistema detecta en los campos “Tiene iva” o “Impuesto X” (X, valor de 2 a 5) tienen valor “1”, el sistema
aplicará el impuesto a este producto y la jerarquía se aplicará de acuerdo a la parametrización del Producto de
Software.


Si el sistema detecta en los campos “Tiene iva” o “Impuesto X” (X, valor de 2 a 5) tienen valor “0”, el sistema no
aplicará el impuesto a este producto.


**Nota 10:** La jerarquía para aplicar impuestos es la siguiente:


Si en la ficha del producto en el grupo de impuesto se asigna un tipo de impuesto y es diferente a “General”, se
aplicará este impuesto.


Si en la ficha de producto el tipo de impuesto es “General”, el sistema verificará si tiene asignado un tipo de
impuesto en la ficha del Cliente, si lo tiene, se procederá aplicar este impuesto; caso contrario el sistema verificará
si tiene asignado un grupo de impuesto en la sucursal de ser esto verdadero aplicará este impuesto, caso contrario
aplicará el impuesto asignado a nivel de empresa.


**Nota 11:** Los códigos y valores enviados (no necesarios) en los campos **“Código del impuesto X”; “Porcentaje del**
**impuesto X”,** serán validados en el Producto de Software, si existen y corresponden los valores se aplicarán estos
a la operación caso contrario si detecta vacío, el sistema lo tomará de la parametrización del Producto de Software
respetando la jerarquía del sistema.


**Nota 12:** Los datos fiscales se almacenan en el Campo: **TEXTO6_X,** si no se usa dejar en BLANCO.


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, TEXTO4_X, NumDoc_s; Origin; Local_Destino; Local_Origen; IDConsulta_s; Opcion_i **)**


**VALUES(** ‘04’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,’
001|N0300322|19/03/2012|19/03/2012||||US|0|1|GEN|0|PRI|1|0||||0|||PRI||01;;;;0000000000;;;;|1||0|
|00/00/00


001|510005822003|1|75.4464|0|1|0||0|0|||||||||0|0|0|00/00/00|00/00/00|00/00/00|01;;;;0000000000;;
;;|0|0|0|0||0||0||0||0||0||75.45’, ‘9’; ‘PRI, ‘PRI’, ‘PRI, ‘DERMAPRI009’;0 **)**


**EJEMPLO Web Services Entrada:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘04’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’
001|N0300322|19/03/2012|19/03/2012||||US|0|1|GEN|0|PRI|1|0||||0|||PRI||01;;;;0000000000;;;;|1||0|
|00/00/00


001|510005822003|1|75.4464|0|1|0||0|0|||||||||0|0|0|00/00/00|00/00/00|00/00/00|01;;;;0000000000;;
;;|0|0|0|0||0||0||0||0||0||75.45’&TEXTO3_X=‘9’; ‘PRI&TEXTO4_X=‘PRI’&NumDoc_s; Origin; Local_Destino;
Local_Origen; IDConsulta_s; Opcion_i=‘PRI


Lleva Tu Empresa Al **106**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO:**

|Campo|Datos|
|---|---|
|**CODE_s**|04|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**ORIGIN**|ARA|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|001|N0300322|19/03/2012|19/03/2012||||US|0|1|GEN|0|PRI|1|0||||0|||P<br>RI||01;;;;0000000000;;;;|1||0||00/00/00|
|**TEXTO3_X**|001|510005822003|1|75.4464|0|1|0||0|0|||||||||0|0|0|00/00/00|00/00/00<br>|00/00/00|01;;;;0000000000;;;;|0|0|0|0||0||0||0||0||0||75.45|
|**TEXTO4_X**|001|19/03/2012|84.5|0|0|
|**TEXTO6_X**||||||||||||||||||||||||||||||||||
|**TEXTO7_X**|001||||||||||||||||
|**NumDoc_s**|9|
|**Local_origen**|ARA|
|**Local_destino**|PRI|
|**IDConsulta_s**|AMERI_9|
|**Opcion_i**|0|



**EJEMPLO Web Services Salida:**


Consulta de nuevas facturas confirmadas, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=104** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **107**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE FACTURAS DE CLIENTES / COMERCIO EXTERIOR / MÉXICO


**VER / EDITAR - CONFIRMADAS**


Para realizar la facturación a través de fuentes externas con conexiones **Web Services o ODBC**, se debe tener muy
en cuenta el proceso que se realiza en el producto de software.


El proceso de facturación consiste en la creación del documento en tres estados;


CONFIRMADAS (Opcion_i=0)


VER-EDITAR (Opcion_i=1)


VER-EDITAR – CONFIRMACION AUTOMATICA (Opcion_i=2)


**Datos de Cabecera:**

|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Código Cliente|X|8|Alfanumérico|Campo Relacionado|
|3|Fecha Emisión Factura|||Date|Formato: dd/mm/aa|
|4|Fecha Vencimiento Factura|||Date|Formato: dd/mm/aa|
|5|Identificación||15|Alfanumérico|Identificación Fiscal|
|6|Nombre Sub-Cliente||30|Alfanumérico|Campo Relacionado|
|7|Código Vendedor||5|Alfanumérico|Campo Relacionado|
|8|Código Moneda||2|Alfanumérico|Campo Relacionado|
|9|Valor de la Cotización|||Real|Si es diferente a la del Sistema|
|10|Número de Pagos Factura|||Entero|Por defecto 1|
|11|Código de la Bodega||3|Alfanumérico|Campo Relacionado|
|12|Descuento de la Factura|||Real||
|13|Código del Sucursal||3|Alfanumérico||
|14|Código de la Caja||3|Alfanumérico|Registro el Código de la Caja, si el<br>manejo es por Sucursal registre 999.|
|15|Vendedor comisiona|||Booleano||
|16|Teléfono Sub-Cliente||10|Alfanumérico||



Lleva Tu Empresa Al **108**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|17|Dirección del Sub-Cliente||30|Alfanumérico||
|18|Identificación del Sub-Cliente||15|Alfanumérico||
|19|Código del Sub-Cliente|||Entero||
|20|Documento del Sub-Cliente||15|Alfanumérico|Identificación Fiscal|
|21|Referencias del Sub-Cliente||20|Alfanumérico||
|22|Origen (Código del Sucursal)|X|3|Alfanumérico|Código de la Sucursal Origen de la<br>Factura, igual campo 13|
|23|Tipo de Documento|X|5|Alfanumérico|Al enviar el campo vacío el sistema lo<br>interpretará como documento<br>Factura|
|24|Multidimensión||15|Alfanumérico|Códigos separados y terminados en<br>(;) en el siguiente orden:<br>Departamento; Centro de Costo;<br>Proyecto; Subproyecto; Análisis 1;<br>Análisis 2; Análisis 3; Memo<br>Proyecto;|
|25|Pago en Venta|||Booleano||
|26|Memo Factura|||Texto||
|27|Imprimir Campo Memo en<br>Factura|||Booleano||
|28|Número de Aprobación|||Alfanumérico|Emitido por el Ente Controlador (SRI)|
|29|Fecha Caducidad|||Date|Emitido por el Ente Controlador (SRI)|


**NOTAS:**


En el caso de usar: VER-EDITAR – CONFIRMACION AUTOMATICA (Opcion_i=2), se debe considerar las siguientes
Observaciones:


1.- El campo 1: Número Factura, este valor es un Identificador único de la factura este campo se almacenará en
un campo referencial de la factura, al registrar esta información será validad su existencia en la base de datos.


2.- El campo 22: Tipo de Documento, en este campo se debe registrar el dato del tipo de documento relacionado
a la factura.


3.- Si las validaciones son correctas, se procederá a confirmar el documento si en el proceso de confirmación se
marca algún error el registro quedará en Ver/Editar.


4,- Este Tipo de Factura solo aplica para el país MEXICO, y se maneje con Comercio Exterior.


Lleva Tu Empresa Al **109**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**






|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Código del Producto|X||Real||
|3|Cantidad a Facturar|||Real||
|4|Precio Unitario|||Real||
|5|Número de Unidades Gratis|||Real||
|6|Detalle con IVA|||Booleano||
|7|Porcentaje de Descuento por Detalle|||Real||
|8|Tamaño|||Real||
|9|Valor del Peso|||Real||
|10|Valor del Peso Neto|||Real||
|11|Color del  Producto|||Alfanumérico||
|12|Grosor del Producto|||Real||
|13|Identificación|||Alfanumérico||
|14|Observaciones|||Texto||
|15|Información Adicional|||Texto||
|16|Referencia Campo Adicional 1|||Alfanumérico|En Información Adicional TEXTO 1|
|17|Referencia Campo Adicional 2|||Alfanumérico|En Información Adicional TEXTO 2|
|18|Referencia Campo Adicional 3|||Alfanumérico|En Información Adicional TEXTO 3|
|19|Referencia Campo Numérico 1|||Real|En Información Adicional VALOR 1|
|20|Referencia Campo Numérico 2|||Real|En Información Adicional VALOR 2|
|21|Referencia Campo Numérico 3|||Real|En Información Adicional VALOR 3|
|22|Referencia Campo de Tipo Fecha 1|||Fecha|En Información Adicional|
|23|Referencia Campo de Tipo Fecha 2|||Fecha|En Información Adicional|
|24|Referencia Campo de Tipo Fecha 3|||Fecha|En Información Adicional<br>|



Lleva Tu Empresa Al **110**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|25|Multidimensión por Detalle|X||Booleano|Códigos separados y terminados<br>en (;) en el siguiente orden:<br>Departamento; Centro de Costo;<br>Proyecto; Subproyecto; Análisis 1;<br>Análisis 2; Análisis 3; Memo<br>Proyecto;|
|26|Impuesto 2|||Booleano||
|27|Impuesto 3|||Booleano||
|28|Impuesto 4|||Booleano||
|29|Impuesto 5|||Booleano||
|30|Código del Impuesto 1|||Alfanumérico|Campo Relacionado|
|31|Porcentaje del Impuesto 1|||Real||
|32|Código del Impuesto 2|||Alfanumérico|Campo Relacionado|
|33|Porcentaje del Impuesto 2|||Real||
|34|Código del Impuesto 3|||Alfanumérico|Campo Relacionado|
|35|Porcentaje del Impuesto 3|||Real||
|36|Código del Impuesto 4|||Alfanumérico|Campo Relacionado|
|37|Porcentaje del Impuesto 4|||Real||
|38|Código del Impuesto 5|||Alfanumérico|Campo Relacionado|
|39|Porcentaje del Impuesto 5|||Real||
|40|Lote y Ubicación|||Texto|Separados con (;)<br>Lote;Cantidad;<br>Ubicación1;Cantidad1;<br>Ubicación2;Cantidad2|
|41|Total Neto de la Línea de Detalle|||Rea||
|42|Complemento 1|||Real|Cantidad de Comercio Exterior 1.1|
|43|Complemento 2||||Adicional Complemento 2|
|44|Complemento 3||||Adicional Complemento 3|
|45|Addenda 1||||Adicional Addenda 1|
|46|Addenda 2||||Adicional Addenda 2|
|47|Addenda 3||||Adicional Addenda 3|


Lleva Tu Empresa Al **111**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Esta factura puede tener detalle de cuotas, datos no necesarios para facturas PENDIENTES A CONFIRMAR y los
datos transmitidos son:


**Datos de Cuotas:**

|No.|Nombre Campo|Obl|Tamaño|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Fecha de Pago de la Cuota|||Fecha|Formato: DD/MM/AAAA|
|3|Valor de la Cuota|||Real||
|4|Número de Días de Pago||||En el caso de ser a Crédito|
|5|Porcentaje||||En el caso de ser a Crédito|



Lleva Tu Empresa Al **112**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Información Adicional (ABC):**





|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Factura|X||Real|Dato Obligatorio para Facturas<br>Confirmadas|
|2|Pedido Manual||20|Alfanumérico||
|3|Fecha Pedido Manual|||Fecha|Formato: DD/MM/AAAA.|
|4|Orden de Compra Cliente||20|Alfanumérico||
|5|Fecha Orden de Compra|||Fecha|Formato: DD/MM/AAAA.|
|6|Recibo Entrega Mercadería||20|Alfanumérico||
|7|Fecha Recibo Entrega Mercadería|||Fecha|Formato: DD/MM/AAAA.|
|8|Variable Adicional 1 (*)||20|Alfanumérico||
|9|Variable Adicional 2 (*)||20|Alfanumérico||
|10|Variable Adicional 3 (*)||50|Alfanumérico||
|11|Variable Adicional 4 (*)||50|Alfanumérico||
|12|Variable Adicional 5 (*)||50|Alfanumérico||
|13|Variable Adicional 6 (*)||50|Alfanumérico||
|14|Uso de Documento Digital||5|Alfanumérico|Código Relacional ingresado en MBA|
|15|Tipo de Relación de Documento||5|Alfanumérico|Código Relacional ingresado en MBA|
|16|Documento Relacionado||20|Alfanumérico|Número de Factura Afectada|
|17|Tipo Documento Relacionado||5|Alfanumérico|Tipo de Documento Relacionado|
|18|Referencia Única Interna||10|Alfanumérico|Identificación Única de Ventas|
|19|Clave de pedimento||2|Alfanumérico|Corresponde el valor - A1, Fijo|
|20|No. Certificado Origen||6-40|Alfanumérico|Valor Registrado 6 -40 Caracteres|
|21|No. Exportador Confiable|||Alfanumérico|Valor Registrado|
|22|Tipo de Operación||1|Alfanumérico|Valor Relacionado x defecto 2|
|23|Certificado Origen||5|Alfanumérico|Valor Relacionado|
|24|SubDivisión||5|Alfanumérico|Valor Relacionado|
|25|Intercom||5|Alfanumérico|Valor Relacionado|
|26|Propietario – Identificación||20|Alfanumérico|Valor Registrado|
|27|Propietario –Residencia||5|Alfanumérico|Valor Relacionado|
|28|Motivo Traslado||5|Alfanumérico|Valor Relacionado|
|29|Tipo de Exportación||5|Alfanumérico|Código Relacional ingresado en MBA|


Lleva Tu Empresa Al **113**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


(*) Estos campos varían el nombre en función de la aplicación en el manejo de las Addendas / Complemento de
Comercio Exterior 1.1, en MBA3 el orden se maneja de izquierda - derecha y de arriba – abajo, es necesario
verificar los manuales de las adendas para determinar los campos obligatorios.


Esta Información se almacena en el campo **TEXTO7_X** y es obligatorio, si no pasa datos dejar los pipes, los campos
14 / 15/ 16, se usan en Emisión Digital CFDI 3.3 (México).


Si se pasa en blanco, el campo 14 toma el dato de “G01”, que es un general en el catálogo del SAT.


Los campos 15 y 16, son obligatorios los 2 y se los toma datos de una Factura de Anticipo.


El campo 17 es obligatorio para identificar el tipo de documento a usar.


Lleva Tu Empresa Al **114**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**DATOS FISCALES – La Definición se basa en la dada en el Sistema. País: ECUADOR.**

|No|Nombre de<br>Campo|Obl|Tipo de Dato|Tamaño|Definición en Fiscal / Especificaciones|
|---|---|---|---|---|---|
|1|Lista Datos 1||Texto|5|Distrito Aduanero|
|2|Lista Datos 2||Texto|5|Régimen|
|3|Lista Datos 3||Texto|5|Tipo de Documento|
|4|Lista Datos 4||Texto|5|Términos de la Factura|
|5|Lista Datos 5||Texto|5|País Adquisición|
|6|Lista Datos 6||Texto|5|País Origen|
|7|Lista Datos 7||Texto|5|Forma de Pago|
|8|Lista Datos 8||Texto|5|Tipo de Exportación (Refrendo)|
|9|Alfanumérico 1||Alfanumérico|80|Año|
|10|Alfanumérico 2||Alfanumérico|80|Correlativo|
|11|Alfanumérico 3||Alfanumérico|80|Verificador|
|12|Alfanumérico 4||Alfanumérico|80|Documento Transporte|
|13|Alfanumérico 5||Alfanumérico|80|Lugar de Inicio|
|14|Valor 1||Real|||
|15|Valor 2||Real|||
|16|Valor 3||Real|||
|17|Valor 4||Real|||
|18|Valor 5||Real|||
|19|Fecha 1||Fecha|dd/mm/aa|Fecha Embarque|
|20|Fecha 2||Fecha|dd/mm/aa||
|21|Fecha 3||Fecha|dd/mm/aa||
|22|Fecha 4||Fecha|dd/mm/aa||
|23|Fecha 5||Fecha|dd/mm/aa||
|24|Booleano 1||Booleano|Si=1/No=0|Factura de Exportación: SI=1 / NO=0|
|25|Booleano 2||Booleano|Si=1/No=0|Refrendo: SI=1 / NO=0|
|26|Booleano 3||Booleano|Si=1/No=0|No Reportable: SI=1 / NO=0|



Lleva Tu Empresa Al **115**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No|Nombre de<br>Campo|Obl|Tipo de Dato|Tamaño|Definición en Fiscal / Especificaciones|
|---|---|---|---|---|---|
|27|Booleano 4||Booleano|Si=1/No=0|Exportación a Paraíso Fiscal: SI=1 / NO=0|
|28|Booleano 5||Booleano|Si=1/No=0|El Ingreso del Exterior Gravado con IR: SI=1 /<br>NO=0|
|29|Booleano 6||Booleano|Si=1/No=0||
|30|Booleano 7||Booleano|Si=1/No=0||
|31|Texto 1||||Denominación del Régimen Fiscal Preferente<br>o Jurisdicción de Menor Imposición|
|32|Texto 2||||Puerto Embarque|
|33|Texto 3||||Puerto Destino|


**Los Campos sin Especificaciones NO son usados, pero se debe enviar su definición.**


Lleva Tu Empresa Al **116**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Este esquema y orden son necesarios tener presente en el momento de almacenar la información en la base de
datos (BDD) de nuestro producto para registrar las transacciones de facturas.


**Nota 1:**


Entrada de Datos:


Campo: CODE_s = 27,


Campo: GROUP_CATEGORY_s = API


Salida de Datos:


Campo: CODE_s = 127,


Campo: GROUP_CATEGORY_s = APIOT


**Nota 2:** Para el caso de ingresar FACTURAS PENDIENTES A CONFIRMAR, el campo **“Opcion_i”** debe estar asignado
el valor UNO(1).


**Nota 3** : Todos los campos numéricos al no tener un valor, por defecto es necesario enviar CERO. Los campos de
tipo Fecha que no tengan asignado un valor y no sean obligatorios es necesario enviar el valor por defecto
“00/00/00”, los campos de tipo BOOLEANO 0: Falso ó 1: Verdadero


**Nota 5** : Sólo en las facturas “NO CONFIRMADAS” permitirá enviar el número del documento con CERO y se
manejará el campo **“Opcion_i”**


**Nota 6** : Si la operación se utiliza con el código “ **27** ”, no es necesario enviar el API de cobros “ **02** ”, ya que el proceso
confirma y realiza el cobro con los datos enviados.


**Nota 7** : Toda factura NO CONFIRMADA, siempre entra en la cola de impresión.


**Nota 8** : En facturas NO CONFIRMADAS, no es necesario enviar la cuota de pago.


Lleva Tu Empresa Al **117**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 9:** Para el manejo de los impuestos o grupos de impuestos:


Si el sistema detecta en el campo “Tiene iva” o “Impuesto X” (X, valor de 2 a 5) tienen valor “VACIO”, el sistema
tomará la parametrización establecida en el Producto de Software.


Si el sistema detecta en los campos “Tiene iva” o “Impuesto X” (X, valor de 2 a 5) tienen valor “1”, el sistema
aplicará el impuesto a este producto y la jerarquía se aplicará de acuerdo a la parametrización del Producto de
Software.


Si el sistema detecta en los campos “Tiene iva” o “Impuesto X” (X, valor de 2 a 5) tienen valor “0”, el sistema no
aplicará el impuesto a este producto.


**Nota 10:** La jerarquía para aplicar impuestos es la siguiente:


Si en la ficha del producto en el grupo de impuesto se asigna un tipo de impuesto y es diferente a “General”, se
aplicará este impuesto.


Si en la ficha de producto el tipo de impuesto es “General”, el sistema verificará si tiene asignado un tipo de
impuesto en la ficha del Cliente, si lo tiene, se procederá aplicar este impuesto; caso contrario el sistema verificará
si tiene asignado un grupo de impuesto en la sucursal de ser esto verdadero aplicará este impuesto, caso contrario
aplicará el impuesto asignado a nivel de empresa.


**Nota 11:** Los códigos y valores enviados (no necesarios) en los campos **“Código del impuesto X”; “Porcentaje del**
**impuesto X”,** serán validados en el Producto de Software, si existen y corresponden los valores se aplicarán estos
a la operación caso contrario si detecta vacío, el sistema lo tomará de la parametrización del Producto de Software
respetando la jerarquía del sistema.


**Nota 12:** Los datos fiscales se almacenan en el Campo: **TEXTO6_X,** si no se usa dejar en BLANCO.


Lleva Tu Empresa Al **118**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, TEXTO4_X, NumDoc_s; Origin; Local_Destino; Local_Origen; IDConsulta_s; Opcion_i **)**


**VALUES(** ‘27’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,’
001|N0300322|19/03/2012|19/03/2012||||US|0|1|GEN|0|PRI|1|0||||0|||PRI||01;;;;0000000000;;;;|1||0|
|00/00/00


001|510005822003|1|75.4464|0|1|0||0|0|||||||||0|0|0|00/00/00|00/00/00|00/00/00|01;;;;0000000000;;
;;|0|0|0|0||0||0||0||0||0||75.45’, ‘9’; ‘PRI, ‘PRI’, ‘PRI, ‘DERMAPRI009’;0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘27’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’
001|N0300322|19/03/2012|19/03/2012||||US|0|1|GEN|0|PRI|1|0||||0|||PRI||01;;;;0000000000;;;;|1||0|
|00/00/00


001|510005822003|1|75.4464|0|1|0||0|0|||||||||0|0|0|00/00/00|00/00/00|00/00/00|01;;;;0000000000;;
;;|0|0|0|0||0||0||0||0||0||75.45’&TEXTO3_X=‘9’; ‘PRI&TEXTO4_X=‘PRI’&NumDoc_s; Origin; Local_Destino;
Local_Origen; IDConsulta_s; Opcion_i=‘PRI


Lleva Tu Empresa Al **119**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO:**







|Campo|Datos|
|---|---|
|**CODE_s**|27|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**ORIGIN**|ARA|
|**TEXTO1_10**|1|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|001|N0300322|19/03/2012|19/03/2012||||US|0|1|GEN|0|PRI|1|0||||0|||P<br>RI||01;;;;0000000000;;;;|1||0||00/00/00|
|**TEXTO3_X**|001|510005822003|1|75.4464|0|1|0||0|0|||||||||0|0|0|00/00/00|00/00/00<br>|00/00/00|01;;;;0000000000;;;;|0|0|0|0||0||0||0||0||0||75.45|1|C2|C3|A1|<br>A2|A3|
|**TEXTO4_X**|001|19/03/2012|84.5|0|0|
|**TEXTO6_X**|||||||||||||||||||||||||||||||||  ----**PARA MEXICO DEJAR EN BLANCO**  ----|
|**TEXTO7_X**||||||||||||||||||A1|1234567890|123456|2|CO1|Sv1|IN1|1001|ECU|mt1|
|**NumDoc_s**|9|
|**Local_origen**|ARA|
|**Local_destino**|PRI|
|**IDConsulta_s**|AMERI_9|
|**Opcion_i**|0|


Lleva Tu Empresa Al **120**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


CREACIÓN DE COBROS DE CLIENTES


Este proceso registra cobros realizados con varios detalles, es decir; aplicadas a varias facturas, con varias formas
de cobros, cuotas: Normal o de reserva; además se aplica a los depósitos correspondientes.


Antes de iniciar el proceso de creación de registros de cobros en el producto, es necesario tener en cuenta el
siguiente esquema de información:


**NOTA:**


Se implementó como nueva funcionalidad en el manejo de cobros, la posibilidad de hacer el registro sobre una
factura creada con la opción 3: “Ver/Editar Confirmación Automática”, en este caso se debe tomar en cuenta los
siguiente:


1. En el campo **Opción_i** debe ir el valor **2** (Dos)


2. El Número de Factura que se registre en la trama será validado con el campo de referencia Api en la

Cabecera de la Factura, si existe el número se procederá a continuar con el proceso.


3. El manejo de la Identificación Externa del Cobro sigue de la misma forma, es decir se validará su

existencia.


**Datos de Cabecera:**













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Fecha del Cobro|X|||Formato "dd/mm/aa"|
|2|Monto del Cobro|X||Real||
|3|Código de la Moneda||2|Alfanumérico|Campo Relacionado|
|4|Código del Cliente|X|8|Alfanumérico|Campo Relacionado|
|5|Memo del Cobro|||Texto||
|6|Identificación Externa obro||10|Alfanumérico||
|7|Tipo de Operación||1|Alfanumérico|N= Normal                    R=<br>Reserva                     A =<br>Auto Distribución|
|8|Manejo de Exceso de pago||1|Alfanumérico|R = Reserva                   A =<br>Auto Distribución a Pendientes|
|9|Cobro Depositado||1|Alfanumérico|D = Depositado,Si no deposita Dejar<br>en Blanco|
|10|Cuenta del Banco|X|15||Campo Relacionado|


Lleva Tu Empresa Al **121**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|11|# Papeleta Ref. de Depósito|X|30|Real||
|12|Fecha del Depósito|X|||Formato "dd/mm/aa"|
|13|Origen del Depósito|X|||Opciones:<br>TRANS = Transferencia<br>DEPCE = Depósitos Clientes Otros<br>DEPCL = Depósitos Clientes|
|14|Secuencial número de Cobro|||Real|Por defecto Cero. Se pasa el número<br>del cobro si se usa bajo modalidad<br>móviles directos.|
|15|Código Sucursal|X|3|Alfanumérico|Donde se realiza el Cobro|
|16|Cotización|||Real||


**Datos de Detalle:**













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de la Factura|X|30|Alfanumérico|O tipo de Documento a ser afectado|
|2|Número de Cuota a ser<br>afectada|||Real|Si es Efectivo siempre debe ir (1)|
|3|Monto de Pago de esa<br>Factura|X||Real||
|4|Datos de Retención. Separados por punto y coma|Datos de Retención. Separados por punto y coma|Datos de Retención. Separados por punto y coma|Datos de Retención. Separados por punto y coma|Datos de Retención. Separados por punto y coma|
|4.1|Código del Tipo de Retención||2|Alfanumérico||
|4.2|Valor de la Retención|||Real||
|5|Código de Factura|||Alfanumérico||


Lleva Tu Empresa Al **122**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Forma de Pago:**















|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código de la Forme de Pago|X|2|Alfanumérico|CK = Cheque<br>EF = Efectivo<br>TC = Tarjeta de Crédito<br>TD = Tarjeta de Débito<br>OT = Otros<br>TR = Transferencia|
|2|Monto de la Forma de Pago|||Real||
|3|# del Cheque o Tarjeta de<br>Crédito|||Real|Para MX, se traslada a Comp- Pago.-<br>CtaOrdenate.|
|4|Nombre Entidad o Tarjeta de<br>Crédito||25|Alfanumérico|Para MX, se traslada a Comp- Pago.-<br>NoOperacón.|
|5|Fecha del Cheque o Voucher|||Fecha|dd/mm/aaa|
|6|Origen de la Sucursal||3|Alfanumérico|Campo Relacionado|
|7|Sub Tipo de Pago|X|||Campo Relacionado|
|8|Código de la Cuenta<br>Depositada|||||
|9|Forma de Pago Depositada|||||


Este esquema y orden son necesarios tener presente en el momento de almacenar la información en la base de
datos (BDD) de nuestro producto para registrar las transacciones de cobros.


**Nota 1:** El código de operación para este proceso de Entrada de Datos es **“02”.**


**Nota 2:** Si el sistema se ha parametrizado para manejo de Tipos de Documentos Unificados, los cobros no se
procesarán a través del Monitor de Servicios; se encolarán en el monitor de Unificación para que el usuario del
sistema seleccione los documentos que se procesarán.


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, TEXTO4_X, NumDoc_s, Local_origen, Local_destino, ORIGIN, IDConsulta_s **)**


**VALUES(** ‘02’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,
22/03/12|50|MN|001|||N|R|D|4189318|001|22/03/12|DEPCL|1|PRI|11’,‘100000001|1|50||FC’,
EF|50|1||00/00/00|PRI|02|| **”** ’, ‘22354621’, ‘ARA’, ‘PRI’, ‘ARA’, ‘AMERI_22354621’ **)**


Lleva Tu Empresa Al **123**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘02’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=22/03/12|50|MN|001|||N
|R|D|4189318|001|22/03/12|DEPCL|1|PRI|11’&TEXTO3_X=‘100000001|1|50||FC’&TEXTO4_X=EF|50|1||00/
00/00|PRI|02||”’&NumDoc_s=‘22354621’&Local_origen=‘ARA’&Local_destino=‘PRI’&ORIGIN=‘ARA’&IDConsult
a_s=‘AMERI_22354621’


**EJEMPLO:**

|Campo|Datos|
|---|---|
|**CODE_s**|02|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|22/03/12|50|MN|001|||N|R|D|4189318|001|22/03/12|DEPCL|1|PRI|11|
|**TEXTO3_X**|100000001|1|50||FC|
|**TEXTO4_X**|EF|50|1||00/00/00|PRI|02||**”**|
|**NumDoc_s**|22354621|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**IDConsulta_s**|AMERI_22354621|
|**Opcion_i**|0 (Esta opción debe tomar el valor 2, si hace referencia al registro de datos en<br>facturas como ver/editar – Confirmación Automática.)|



**Ejemplo Web Services Salida:**


Consulta de nuevos cobros de cliente, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=102** &ap_int1=1


Para más información ver la última parte del Anexo E.


Lleva Tu Empresa Al **124**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


NOTAS DE CRÉDITO / DÉBITO


El proceso de notas de débito / crédito, se aplica a clientes y proveedores; afectando un documento en los mismos
y a sus correspondientes cuotas de pago.


Para el proceso se ha dividido en dos partes: Detalle la nota de débito / crédito (tipo de nota utilizadas y valores)
y Distribución (cuotas); los mismos que se componen de:


**Datos de Cabecera:**













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|ID del Usuario|X|||Registro la Nota de D/C|
|2|Código de la Empresa|X|5|Alfanumérico|Denominado también "CORP"|
|3|Nota de Dedito o Crédito|X|||0=> Nota de Crédito; 1=>Nota<br>de Débito|
|4|Si se Aplica|X|||1=>Proveedor, 2=>cliente|
|5|Código Cliente o Proveedor|X|20|Alfanumérico||
|6|Fecha de la Nota de Crédito / Débito||||Formato dd/mm/aa|
|7|Identificador del Documento|X|||# de Factura o R1(código a la<br>reserva)|
|8|Código de Apertura Caja||||Si tienen Apertura en un<br>mismo día|
|9|Código de la Caja||||Definidos Producto de<br>Software|
|10|Código del Sucursal||3|Alfanumérico|Definidos Producto de<br>Software|
|11|Devolución por Inventario|||||
|12|Monto del Inventario|||Real|Por defecto 0|
|13|Monto del Impuesto|||Real|Por defecto 0|
|14|Monto del Descuento|||Real|Por defecto 0|
|15|Monto del Impuesto 2|||Real|Por defecto 0|
|16|Monto del Impuesto 3|||Real|Por defecto 0|


Lleva Tu Empresa Al **125**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|17|Monto del Impuesto 4|||Real|Por defecto 0|
|18|Monto del Impuesto 5|||Real|Por defecto 0|
|19|Código de Moneda||2|Alfanumérico||
|20|Referencia Externa||20|Alfanumérico||
|21|Tipo Documento Factura||5|Alfanumérico||


**Datos de Detalle** :













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Tipo de Nota Aplicado|X||Alfanumérico||
|2|Valor Total de la Línea|X||Real||
|3|Si la Línea Aplica o no Impuesto 1|||Booleano|1 = Aplica / 0 = No aplica|
|4|Si la Línea Aplica o no el IVA|||Booleano|1 = Aplica / 0 = No aplica|
|5|Contenido de Multidimensión|||Booleano|Códigos separados y<br>terminados en (;) en el siguiente<br>orden: Departamento; Centro<br>de Costo; Proyecto;<br>Subproyecto; Análisis 1; Análisis<br>2; Análisis 3; Memo Proyecto;|
|6|Memo de la Nota||50|Alfanumérico||
|7|Valor Proporcional de la Factura|||Real|Por defecto 0|
|8|Valor Proporcional del Impuesto 1|||Real|Por defecto 0|
|9|Valor Proporcional del Impuesto 2|||Real|Por defecto 0|
|10|Valor Proporcional del Impuesto 3|||Real|Por defecto 0|
|11|Valor Proporcional del Impuesto 4|||Real|Por defecto 0|
|12|Valor Proporcional del Impuesto 5|||Real|Por defecto 0|
|13|Si la Línea aplica o no el Impuesto 2|||Booleano|1 = Aplica / 0 = No aplica|
|14|Si la Línea aplica o no el Impuesto 3|||Booleano|1 = Aplica / 0 = No aplica|
|15|Si la Línea aplica o no el Impuesto 4|||Booleano|1 = Aplica / 0 = No aplica|
|16|Si la Línea aplica o no el Impuesto 5|||Booleano|1 = Aplica / 0 = No aplica|


Lleva Tu Empresa Al **126**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|17|Valor Porcentaje Impuesto 1|||Real|Porcentaje de Impuesto|
|18|Valor Porcentaje Impuesto 2|||Real|Porcentaje de Impuesto|
|19|Valor Porcentaje Impuesto 3|||Real|Porcentaje de Impuesto|
|20|Valor Porcentaje Impuesto 4|||Real|Porcentaje de Impuesto|
|21|Valor Porcentaje Impuesto 5|||Real|Porcentaje de Impuesto|
|22|Código del Impuesto 1||3|Alfanumérico||
|23|Código del Impuesto 2||3|Alfanumérico||
|24|Código del Impuesto 3||3|Alfanumérico||
|25|Código del Impuesto 4||3|Alfanumérico||
|26|Código del Impuesto 5||3|Alfanumérico||


**Detalle de Cuota:**







|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|# de la Cuota a la cuál será Afectada|X||Real||
|2|Valor de la Cuota|X||Real||


Lleva Tu Empresa Al **127**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos Adicionales de Documento Impreso:**





|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|No. Documento Impresión|X||||
|2|Tipo de Documento Nota||||Si es el Documento del<br>Sistema dejar en blanco|
|3|Fecha de Impresión (00/00/00)|X||Fecha|Si Blanco, toma del sistema|
|4|Hora de Impresión (00:00)|X||Hora|Si Blanco, toma del sistema|
|5|Formato de Impresión|||Numero|Valores (1 a 5), Por defecto 1|
|6|Espacio Disponible 1|||||
|7|Espacio Disponible 2|||||
|8|Espacio Disponible 3|||||
|9|Espacio Disponible 4|||||
|10|Espacio Disponible 5|||||


Lleva Tu Empresa Al **128**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**DATOS FISCALES – La Definición se basa en la dada en el Sistema. País: ECUADOR.**

|No|Nombre de<br>Campo|Obl|Tipo de Dato|Tamaño|Definición en Fiscal / Especificaciones|
|---|---|---|---|---|---|
|1|Lista Datos 1||Texto|5|Distrito Aduanero|
|2|Lista Datos 2||Texto|5|Régimen|
|3|Lista Datos 3||Texto|5|Tipos de comprobante|
|4|Lista Datos 4||Texto|5|Términos de la Factura|
|5|Lista Datos 5||Texto|5|País Adquisición|
|6|Lista Datos 6||Texto|5|País Origen|
|7|Lista Datos 7|X|Texto|5|Forma de Pago|
|8|Lista Datos 8||Texto|5|Tipo de Exportación (Refrendo)|
|9|Alfanumérico 1||Alfanuméric<br>o|80|Año|
|10|Alfanumérico 2||Alfanuméric<br>o|80|Documento Transporte|
|11|Alfanumérico 3||Alfanuméric<br>o|80|Lugar de Inicio|
|12|Alfanumérico 4||Alfanuméric<br>o|80||
|13|Alfanumérico 5||Alfanuméric<br>o|80||
|14|Valor 1||Real||Correlativo|
|15|Valor 2||Real||Verificador|
|16|Valor 3||Real|||
|17|Valor 4||Real||Valor FOB|
|18|Valor 5||Real|||
|19|Fecha 1||Fecha|dd/mm/a<br>a|Fecha Embarque Documento|
|20|Fecha 2||Fecha|dd/mm/a<br>a||
|21|Fecha 3||Fecha|dd/mm/a<br>a||



Lleva Tu Empresa Al **129**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


|No|Nombre de<br>Campo|Obl|Tipo de Dato|Tamaño|Definición en Fiscal / Especificaciones|
|---|---|---|---|---|---|
|22|Fecha 4||Fecha|dd/mm/a<br>a||
|23|Fecha 5||Fecha|dd/mm/a<br>a||
|24|Booleano 1||Booleano|Si=1/No=<br>0|NC / ND de Exportación, SI=1 / NO=0|
|25|Booleano 2||Booleano|Si=1/No=<br>0|Refrendo, SI=1 / NO=0|
|26|Booleano 3||Booleano|Si=1/No=<br>0|No Reportable, SI=1 / NO=0|
|27|Booleano 4||Booleano|Si=1/No=<br>0||
|28|Booleano 5||Booleano|Si=1/No=<br>0||
|29|Booleano 6||Booleano|Si=1/No=<br>0||
|30|Booleano 7||Booleano|Si=1/No=<br>0||
|31|Texto 1||||Puerto Embarque|
|32|Texto 2||||Puerto Destino|
|33|Texto 3|||||


**Los Campos sin Especificaciones NO son usados, pero se debe enviar su definición.**


Lleva Tu Empresa Al **130**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Nota 1:** El código de operación para éste proceso de Entrada de Dato es **“10”.**


**Nota 2:** La “ **Opcion_i”** puede tomar los siguientes valores:


“0” – Ver / Editar


“1” – Confirmada


“2” – Confirmada e Impresa


**Nota 3:** Si se pasa Datos Adicionales se almacena en el campo TEXTO6_X


**Nota 4:** Si se pasa Datos Fiscales se almacena en el campo TEXTO7_X


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X
,TEXTO3_X, TEXTO4_X; Opcion_i, Local_origen, Local_destino, ORIGIN, IDConsulta_s **)**


**VALUES(** ‘10’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,
“1|FUTUR|0|2|TIJ00986|29/03/12|1000000000|||TIJ|0|0|0|0|0|0|0|0|US|REFEXT| TIPDOCFAC”,


’ CHD01|140|0|0|;;;;;;;;||140|0|0|0|0|0|0|0|0|0|0|0|0|0|0|||||’,


‘1|140’, 1, ‘ARA’, ‘PRI’, ‘ARA’, ‘AMERI_10245’ **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘10’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=“1|FUTUR|0|2|TIJ00986|2
9/03/12|1000000000|||TIJ|0|0|0|0|0|0|0|0|US|REFEXT| TIPDOCFAC”&TEXTO3_X=’
CHD01|140|0|0|;;;;;;;;||140|0|0|0|0|0|0|0|0|0|0|0|0|0|0|||||’&TEXTO4_X;
Opcion_i=‘1|140’&Local_origen=1&Local_destino=‘ARA’&ORIGIN=‘PRI’&IDConsulta_s=‘ARA’


Lleva Tu Empresa Al **131**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO**

|Campo|Datos|
|---|---|
|**CODE_s**|10|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|1|FUTUR|0|2|TIJ00986|29/03/12|1000000000|||TIJ|0|0|0|0|0|0|0|0|US<br>|REFEXT| TIPDOCFAC|
|**TEXTO3_X**|CHD01|140|0|0|;;;;;;;;||140|0|0|0|0|0|0|0|0|0|0|0|0|0|0||||||
|**TEXTO4_X**|1|140|
|**TEXTO6_X**|001001000000123|NCR|01/05/2018|12:45|1||||||
|**TEXTO7_X**||||||||||||||||||||||||||||||||||
|**Opcion_i**|0=Ver/Editar / 1= Confirmado / 2 = Impreso|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**IDConsulta_s**|AMERI_10245|



**Ejemplo Web Services Salida:**


Consulta de las notas crédito y débito nuevas y confirmadas, sin procesar:


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222& **ap_code=110** &ap_int1=1


Para más información, ver la última parte del Anexo E.


Lleva Tu Empresa Al **132**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# TESORERÍA Y BANCOS

##### Manual de APIs v19.0


CHEQUES MANUALES


Los datos que se requiere para generar este documento:


**Datos de Cabecera:**







|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número de Cuenta del Banco|X|15|Alfanumérico||
|2|Número de Cuenta Contable|X|11|Alfanumérico||


**Datos de Detalle:**







|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|# del Cheque|X||Real||
|2|Fecha de pago|X||Date|Formato: dd/mm/aa|
|3|Beneficiario||80|Alfanumérico||
|4|Monto del Cheque|X||Real||
|5|Dirección del Beneficiario|||Texto||
|6|Memo 1||80|Alfanumérico||
|7|Memo 2|||Real||


**Nota 1:** El código de operación para este proceso de Entrada de Datos es “21”.


Lleva Tu Empresa Al **125**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN, Opcion_i **)**


**VALUES(** '21',’AMERI’,’API’,1,’2’,’192.168.181.233’,‘ 0147104553|99999990000’,’ 1|26/05/11|Karina
Martinez|100|Alpallana| entregado el 26/05/11|’,102,’AMERI-102’, ‘PRI’, ‘PRI’, ‘PRI’,0 **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s='21'&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=‘
0147104553|99999990000’&TEXTO3_X=’ 1|26/05/11|Karina Martinez|100|Alpallana| entregado el
26/05/11|’&NumDoc_s=102&IDConsulta_s=’AMERI102’&Local_origen=‘PRI’&Local_destino=‘PRI’&ORIGIN=‘PRI’&Opcion_i=0


**Ejemplo de Cheques Manuales:**

|Campo|Datos|
|---|---|
|**CODE_s**|21|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|0147104553|99999990000|
|**TEXTO3_X**|1|26/05/11|Karina Martinez|100|Alpallana| entregado el 26/05/11||
|**NumDoc_s**|102|
|**IDConsulta_s**|AMERI-102|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|
|**Opcion_i**|0|



Lleva Tu Empresa Al **126**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


DEPÓSITOS OTROS


Este proceso permite automatizar el ingreso de depósitos otros contra cuentas contables (Ejm. Ingreso de
operaciones financieras -Intereses ganado)


**Datos de Cabecera:**













|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Fecha del Depósito|X||Date|Formato dd/mm/aa|
|2|Cuenta del Banco|X|20|Alfanumérico||
|3|Monto total de Depósito|X||Real||
|4|Referencia del Depósito|||Real||
|5|Moneda del Depósito|X|2|Alfanumérico||
|6|Fecha Papeleta del Depósito|X||Date|Formato dd/mm/aa|
|7|# de Cheques del Depósito|||Real||
|8|Memo del Depósito||60|||
|9|Multidimensión||15|Alfanumérico|Códigos separados y<br>terminados en(;) en el siguiente<br>orden: Departamento; Centro<br>de Costo; Proyecto;<br>Subproyecto; Análisis 1;<br>Análisis 2; Análisis 3; Memo<br>Proyecto;|
|10|Código Sucursal Origen Depósito|X|3|Alfanumérico||
|11|Código del tipo de Origen del<br>Depósito|X|5|Alfanumérico||


Lleva Tu Empresa Al **127**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Datos de Detalle:**
















|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Código de la Cuenta Contable|X|11|Alfanumérico||
|2|Valor que será afectado a la Cuenta<br>Contable|X||Real||
|3|Memo de la Cuenta||80|Alfanumérico||
|4|Multidimensión||15|Alfanumérico|Códigos separados y terminados<br>en(;) en el siguiente orden:<br>Departamento; Centro de Costo;<br>Proyecto; Subproyecto; Análisis<br>1; Análisis 2; Análisis 3; Memo<br>Proyecto;|
|5|Código de la forma de pago|||||
|6|Código del Sub-tipo de la forma de<br>pago|||||



**Nota 1:** El código de operación para este proceso de Entrada de Datos es **“09”.**


**Nota 2:** Tener presente que este proceso ingresa el depósito confirmado.


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X,NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN **)**


**VALUES(** ‘09’,’AMERI’,’API’,1,’2’,’192.168.181.233’,‘
26/05/2011|0147104553|110|123|MN|26/05/2011|1|MEMO DEPOSITO|;;;;;;;;|PRI|DEPCL’,‘
99999990000|110|MEMOOO|01;10;10;10;A10;;;MEMOO;||’, 159789,’159789_1’, ‘ARA’, ‘PRI’, ‘ARA’ **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘09’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=‘
26/05/2011|0147104553|110|123|MN|26/05/2011|1|MEMO DEPOSITO|;;;;;;;;|PRI|DEPCL’&TEXTO3_X=‘
99999990000|110|MEMOOO|01;10;10;10;A10;;;MEMOO;||’&NumDoc_s=159789&IDConsulta_s=’159789_1’&
Local_origen=‘ARA’&Local_destino=‘PRI’&ORIGIN=‘ARA’


Lleva Tu Empresa Al **128**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**EJEMPLO**

|Campo|Datos|
|---|---|
|**CODE_s**|09|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|26/05/2011|0147104553|110|123|MN|26/05/2011|1|MEMO<br>DEPOSITO|;;;;;;;;|PRI|DEPCL|
|**TEXTO3_X**|99999990000|110|MEMOOO|01;10;10;10;A10;;;MEMOO;|||
|**NumDoc_s**|159789|
|**IDConsulta_s**|159789_1|
|**Local_origen**|ARA|
|**Local_destino**|PRI|
|**ORIGIN**|ARA|



Lleva Tu Empresa Al **129**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
TEXTO3_X, TEXTO4_X, NumDoc_s, IDConsulta_s, Local_origen, Local_destino, ORIGIN **)**


**VALUES(** ‘14’,’AMERI’,’API’,1,’2’,’192.168.181.233’,‘
100|P0168|MN|25/01/12|PRI||0|PARCIAL|0||MEMO_FACTURA|||;;;;;;;;|||||Fact|’,‘
KM1|5|10|0|0|0|0|0|0|;;;’, ‘25/01/12|50|0’, 1231,’ AMERI_1231’, ‘PRI, ‘PRI’, ‘PRI **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘14’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=’192.168.181.233’&TEXTO2_X=‘
100|P0168|MN|25/01/12|PRI||0|PARCIAL|0||MEMO_FACTURA|||;;;;;;;;|||||Fact|’&TEXTO3_X=‘
KM1|5|10|0|0|0|0|0|0|;;;’&TEXTO4_X=‘25/01/12|50|0’&NumDoc_s=1231&IDConsulta_s=’
AMERI_1231’&Local_origen=‘PRI&Local_destino=‘PRI’&ORIGIN=‘PRI


**EJEMPLO:**

|Campo|Datos|
|---|---|
|**CODE_s**|14|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|FAP-1001|P9001|MN|08/12/2015|PRI|0|0|TOTAL|0|0|MEMO<br>FACTURA|0|1|;;;;;;;|||0|NOMBRE PAGO|TIP01||PRI|01|
|**TEXTO3_X**|RP1|1|11|1|0|0|0|0|1|;;;;;;;|
|**TEXTO4_X**|31/12/2015|33|0|
|**TEXTO4B_X**|Si hay datos de Retenciones :<br>RET01|100|10|MEMO RET|;;;;;;;|
|**NumDoc_s**|1231|
|**IDConsulta_s**|AMERI_1231|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|



Lleva Tu Empresa Al **130**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# CONTABILIDAD

##### Manual de APIs v19.0


CONTABILIDAD


Dentro del API para el manejo de los procesos contables, se tiene la siguiente estructura.


**Datos de Cabecera:**












|No.|Nombre Campo|Obl|Tamaño<br>Máx.|Tipo de Dato|Especificaciones|
|---|---|---|---|---|---|
|1|Número del Asiento|X||Entero|Dato no debe existir en Sistema|
|2|Cuenta Contable|X|20|Alfanumérico|Dato que debe estar creado en<br>el Sistema|
|3|Referencia del Asiento||50|Alfanumérico|Se debe enviar al menos 5<br>carácteres y máximo 50|
|4|Valor del Débito|||Real||
|5|Valor del Crédito|||Real||
|6|Código de la Moneda|X|2|Alfanumérico||
|7|Fecha del Asiento|X||Date|Formato "dd/mm/aa|
|8|Asiento a Convertir|||Booleanoo|1: Convierte; 0: No Convierte|
|9|Multidimensión||15|Alfanumérico|Códigos separados y<br>terminados en (;) en el siguiente<br>orden: Departamento; Centro<br>de Costo; Proyecto;<br>Subproyecto; Análisis 1; Análisis<br>2; Análisis 3; Memo Proyecto;|
|10|Memo|||Texto||
|11|Tipo de Asiento||1|Entero|Valores Posibles: 1=Ingreso, 2 =<br>Egreso,  3 = Diario, si no tiene<br>valor por defecto se asignada<br>"Diario"|



Estos datos serán almacenados en el campo TEXTO2_x de la tabla de APIs. Si el asiento tiene **“n”** líneas de detalle,
toda esta información deberá ingresar en un solo registro para dicha operación con un máximo de 32 KB.
Considerando que la información corresponda a un registro completo.


**Nota 1:** El código de operación para éste proceso de Entrada de Datos es **“08”.**


**Nota 2:** Se debe tener en cuenta que hay que enviar un detalle por Asiento.


Lleva Tu Empresa Al **132**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**SENTENCIA SQL:**


**INSERT INTO** SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24, TEXTO2_X,
NumDoc_s, IDConsulta_s, Opcion_i, Local_origen, Local_destino, ORIGIN **)**


**VALUES(** ‘08’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,’830|99999999000|Memo_Asiento||50|


MN|27/03/2012|1|;;;;;;;MEMO PROYECTO;|Memo Linea|3’, 100,’ AMERI_100’,0, ‘ARA’, ‘PRI’, ‘ARA’ **)**


**EJEMPLO Web Services:**


192.168.181.56:8093/wsAPIS/api_wr?CORP_s=AMERI&ap_pass=12345678&CODE_s=‘08’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’830|99999999000|Memo
_Asiento||50|


MN|27/03/2012|1|;;;;;;;MEMO PROYECTO;|Memo Linea|3’&NumDoc_s=100&IDConsulta_s=’
AMERI_100’&Opcion_i=0&Local_origen=‘ARA’&Local_destino=‘PRI’&ORIGIN=‘ARA’


**EJEMPLO:**







|Campo|Datos|
|---|---|
|**CODE_s**|08|
|**CORP_s**|AMERI|
|**GROUP_CATEGORY_s**|API|
|**INTEGER_1**|1|
|**LONGINT_1**|Sequence number([SIST_API])|
|**TEXTO1_10**|2|
|**TEXTO1_24**|192.168.181.233|
|**TEXTO2_X**|830|99999999000|ReferenciadelAsiento||50|MN|27/03/2012|1|;;;;;;;;|MemoL<br>inea_1|3|830|8888888000|ReferenciadelAsiento|50||MN|27/03/2012|1|;;;;;;;<br>;|MemoLinea_2|3|
|**TEXTO3_X**||
|**NumDoc_s**|100|
|**IDConsulta_s**|AMERI_100|
|**Opcion_i**|0|
|**Local_origen**|PRI|
|**Local_destino**|PRI|
|**ORIGIN**|PRI|


Lleva Tu Empresa Al **133**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


# ANEXOS

##### Manual de APIs v19.0


**ANEXO A**



ANEXOS



**CONFIGURACION DE ORIGENES DE DATOS (ODBC)**


**NOTA:** en caso de requerir el acceso por medio de **Web Services**, no aplica este anexo si no el Anexo E.


Puede utilizar la Conectividad abierta de base de datos de orígenes de datos (ODBC) para tener acceso a datos
desde una gran variedad de sistemas de administración de bases de datos. Antes de empezar con esta
configuración se debe verificar que se encuentre instalado los manejadores de 4D Server para poder realizar las
correspondientes configuraciones al Producto de Software; para instalar este controlador debe ir al Manual de
Referencia de ODBC Driver 4D SERVER.


Para abrir Orígenes de datos (ODBC), haga clic en **Inicio**, seleccione **Configuración** y, a continuación, haga clic en
**Panel de control** . Haga doble clic en **Herramientas administrativas** y, a continuación, en **Orígenes de datos**
**(ODBC)** .


Para obtener información acerca de cómo usar Orígenes de datos (ODBC), haga clic en **Ayuda** en el cuadro de
diálogo **Administrador de orígenes de datos ODBC** .


Gráfico 1: Administrador de Orígenes de Datos


Lleva Tu Empresa Al **135**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


En este punto debe seleccionar **Agregar,** y aparecerá la siguiente opción:


Gráfico 2: Creación de Nuevo Origen de Datos


Se debe seleccionar el controlador con el cual se necesita trabajar o configurar. Para nuestro caso **ODBC Driver**
**for 4D Server.**


Gráfico 3: Ingreso de Datos de Conexión y Validación


Lleva Tu Empresa Al **136**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Luego de seleccionar el controlador, se presentará la pantalla de configuración; en el cual solicitará: **Data Source**
**Name,** el mismo que lo llamaremos **ODBC4D8; Network Path**, para lo cual se recomienda se digite el **IP del SERVER**
y el **Puerto de CONEXIÓN** (Puerto de conexión por defecto es 19813) en el formato que presenta la pantalla;


**User Name:** API


**Password:** API


Una vez ingresada esta información, para validar estos datos compruebe con la opción **Test data source.**


Lleva Tu Empresa Al **137**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**CONFIGURACION DE ORIGENES DE DATOS (ODBC)**


Cuando es de 64 bits el ODBC se encuentra en la siguiente ruta:


**Equipo / Disco C / Windows / SysWOW64 / odbcad32.exe.**


El Puerto que se registra es el de SQL. Ej 19812.


Lleva Tu Empresa Al **138**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**ANEXO B**


**MONITOR DE SERVICIOS**


El Producto de Software MBA3, maneja el concepto de “SERVIDOR DE SERVICIOS”; es un tipo especial de proceso
informático que se ejecuta en segundo plano en vez de ser controlado directamente por el usuario (es un proceso
no interactivo). Estos tipos de procesos se ejecutan de forma continua (infinita), vale decir, que funciona sin tener
relación con una terminal o consola y, consecuentemente, sin interactuar con un humano; permitiendo ejecutar
varios procesos en una estación específica a través de una conexión 4D Client, que se encuentra escuchando los
diferentes requerimientos de otras estaciones en la RED Empresarial.


Para definir a una estación como un “Servidor de Servicios”, se necesita crear un “archivo Plano” con el nombre
“ **ServidorServicios.txt** ”. Este en su interior tendrá información del número del SERVER definido para esta estación,
es decir si esta estación fue definida como Servidor de Servicios # n, entonces en el contenido del archivo debe
colocarse el # “ **n** ” donde n toma los valores de 1 hasta n (Números enteros positivos).


El archivo “ServidorServicios.txt”, debe ser copiado en el directorio en el cual “4D client” crea sus recursos y bajo
este la carpeta “Application Preferences”.


Por ejemplo, para Windows Vista la carpeta de recursos se crea en: “


C:\Users\Karina\AppData\Roaming\ **4D\Application Preferences** ”. Si ejecutamos el 4D Client tenemos la siguiente
presentación del Producto de Software MBA3:


Gráfico 4: Archivo ServidorServicios.txt


Lleva Tu Empresa Al **139**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Gráfico 5: Monitor de Servicios activado Servicio de APIs


**Nota:** Una vez que los servicios se encuentran ejecutándose como se presenta en la   parte superior, este
procesará toda información que sea enviada al MBA3 y afectará  en los procesos correspondientes que hace
referencia dentro del sistema.


Lleva Tu Empresa Al **140**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**PARAMETRIZACION SERVICIOS APIS**


En Producto de Software MBA3 existen opciones para configurar y ejecutar el servicio de manejo de APIs.


**Parametrización.**


En Administración de MBA3: **Parámetros/ Parámetros Otros/ Parámetros – Servicios** ; presenta un formulario
en el cual se parametriza todos los servicios que se ejecutan en el producto de Software MBA3 en el TAB de
APIs.


Gráfico 6: Parametrización del Servicio de APIs


En este formulario presenta datos del servicio, tales como **Código del Servicio** (presentado por el sistema),
**Nombre del Servicio** (Presentado por el sistema), **Servidor #**, en el que se ejecutará el servicio (1, 2, 3, etc.;
administrado por el usuario); **Permitir ejecutar en,** opciones en el cual el servicio permite ejecutarse en el servidor

   - en una estación cliente, para este caso solo permite ejecutarse en una estación cliente(Administrado por el
sistema); si se puede **ejecutar en varias máquinas** (Administrado por el sistema); **Automático** ; si el servicio se
ejecuta automáticamente al levantar el monitor de servicios(Administrado por el Usuario); **Delay**, opción
administrado por el usuario y permite ingresar que tiempo cíclico que el servicio se ejecutará y procesará la
operación correspondiente.


Lleva Tu Empresa Al **141**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**ANEXO C**


**LOG DE APIS**


Una vez que el proceso se ha ejecutado, el producto tiene la posibilidad de visualizar los registros que no fueron
ejecutados en tal hecho, para lo cual el usuario puede ubicarse en: **Administración / Módulos Adicionales / Log**
**de Comunicaciones / Log de APIs.**


Gráfico 7: Log de APIs


Lleva Tu Empresa Al **142**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**1.-** Pantalla que muestra un listado de todos los procesos que se ejecutaron, están por ejecutarse o aquellos que
provocaron errores, tales procesos (Operaciones), visualizando el CORP; OPERACIÓN, DIRECCIÓN IP del que
solicitó el requerimiento; # de Documento, ERROR, una descripción del error provocado en la ejecución de la
operación; FECHA de la última ejecución de la operación; HORA de la última ejecución de la operación.


**2.-** **Local Origen:** Filtro que permite visualizar la información por el Local Origen.


**3.- Local Destino:** Filtro que permite visualizar la información por el Local Destino.


**4.-** **Tipo de Operación:** Filtro que permite visualizar la información por el Estado de la Operación, pudiendo ser:
Todos (por defecto), Por procesar, Procesado, Procesados con error, Procesados sin error.


**5.- Estados de Operación:** Filtro que permite visualizar la información por operaciones, los mencionados en este
documento.


Lleva Tu Empresa Al **143**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**6.- Procesar:** Permite ejecutar la operación definida en el registro seleccionado.


**7.- Todos:** Permite ejecutar las operaciones correspondientes a todos los registros listados con errores y no
procesados.


**8.- Borrar Datos:** Permite al administrador del sistema eliminar el registro seleccionado (su eliminación será
lógico).


**9.- Exportar Datos:** Permite exportar la información que se encuentre en el Log de APIs a un archivo plano


**10.- Ver Detalle:** Permite visualizar información almacenada en grupos binarios y ver a detalle los datos que se
envían a procesar, los descritos en el documento.


Lleva Tu Empresa Al **144**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**ANEXO D**


**CONEXIÓN VISUAL BASIC**


Como ejemplo de conexión, utilizaremos la herramienta Visual Basic y nos conectaremos a la Estructura de 4D vía
ODBC (En el Anexo E hay ejemplo con Web Services) e insertaremos un registro a la tabla “SIST_API” la operación
“Creación de Clientes”.


ODBC: **MBA3**


Usuario: **API**


Password: **API**


Comandos de conexión en VB:


Dim conec As adodb.Connection


Dim rst As adodb.Recordset


Set conec = New adodb.Connection


conec.Open ("Provider=MSDASQL;DSN=MBA3;UID=RUN")


Set rst = New adodb.Recordset


Método de inserción:


Private Sub Command1_Click()


On Error GoTo fincmd1


Dim sql As String


sql = "INSERT INTO SIST_API **(** CODE_s, CORP_s, GROUP_CATEGORY_s, INTEGER_1, TEXTO1_10, TEXTO1_24,
TEXTO2_X, NumDoc_s, Local_origen, Local_destino, ORIGIN, IDConsulta_s **)**


VALUES **(** ‘05’,’AMERI’,’API’,1,’2’,‘192.168.181.233’,’AMERI|API-200|Cliente Demo|0501764884001|Av. Brasil y
Av. America|59322460555|59322460666|59322460777|clientedemo
@ameri.com|JULIO|1|API|200|JULIO|US|Direccion 2|Direccion 3|Casilla|0|0|0|Memo|19/10/07|Pruebas de
Cliente
DEMO|PRI|MEX|CHIS|112||CZONE|PRICE|WHDIS|L|1103001000|1|6|||0;0;0;0;0;||0|0|6|0|0|0|Exterior|In
terior|Colonia|Localidad||’, ‘API-200’, ‘ARA’, ‘PRI’, ‘ARA’, ‘AMERI_ API-200’)"


Set rst = conec.Execute(sql)


Exit Sub


fincmd1:


Resume Next


End Sub


Lleva Tu Empresa Al **145**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**TimeStamp VB.**


Para obtener la fecha y la hora en un ENTERO LARGO **,** se propone la utilización del siguiente código para tal hecho
y el resultado almacenarlo en el campo LONGINT_2, utilizando Visual Basic:


Dim FechaHoy_d As Date


Dim HoraHoy_t As Date


Dim LongInt_l As Long


FechaHoy_d = Date   ‘Fecha actual del sistema, puede utilizarse el paso de


‘parámetros a través de una función.


HoraHoy_t = Time ‘Hora actual del sistema, puede utilizarse el paso de


‘parámetros a través de una función.


LongInt_l = (FechaHoy_d - #3/23/2002#) * 86400


LongInt_l = LongInt_l + (Hour(HoraHoy_t) * 3600)


LongInt_l = LongInt_l + (Minute(HoraHoy_t) * 60)


LongInt_l = LongInt_l + Second(HoraHoy_t)


Donde LongInt_l, es el resultado final, Fecha y Hora en formato ENTERO LARGO.


Lleva Tu Empresa Al **146**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**ANEXO E**


**CONFIGURACION DE WEB SERVICES**


**NOTAS:**


    - Si se configura el Monitor de Servicios de APIs (Anexo B), este se puede usar también para recibir las
peticiones de los WebServices, por lo que la configuración de este anexo podría saltarse.


    - Si se usa Web Services no es necesario ejecutar el anexo A de configuración ODBC.


Se debe configurar el servicio de escucha http (también conocido como Servicio Web) dentro de parámetros del
sistema / parámetros de empresa / Otros / Servicios:


Lleva Tu Empresa Al **147**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


1. Se debe configurar la IP de escucha, normalmente una IP publica y el puerto.


2. Donde dice “Iniciar Servidor Web Automáticamente” seleccionar una de las dos opciones.


**CONFIGURACION DE CONTRASEÑA DE ACCESO WEB SERVICES**


La contraseña de acceso del campo “ **pa_pass** ” (ver página 6) se configura por empresa en:


Parámetros del sistema / Parámetros Generales / Accesos:


**Nota:** la contraseña debe tener al menos **8 caracteres** .


Lleva Tu Empresa Al **148**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**ESCRITURA / CREACION DE APIS**


Para crear un registro en SIST_API, dentro de MBA3, se deben llenar los campos indicados para cada API y adicional
poner el campo **ap_pass**, definido para cada empresa, por ejemplo, para crear un cliente:


192.168.181.56:8093/ **wsAPIS/api_wr** ?CORP_s=AMERI& **ap_pass** =12345678&CODE_s=‘05’&GROUP_CATEGORY_
s=’API’&INTEGER_1=1&TEXTO1_10=’2’&TEXTO1_24=‘192.168.181.233’&TEXTO2_X=’CL000072|A PRUEBAS
API|1711253573|||||||||||||0|0|0|MN|||||||08/03/2018|L||PRI||1||||||0|0|0|0|0|0||||||||0||||PF|
0||0|0|0||0||||’&NumDoc_s=‘API200’&Local_origen=‘ARA’&Local_destino=‘PRI’&ORIGIN=‘ARA’&IDConsulta_s=‘AMERI_ API-200’


Donde: **192.168.181.56:8093** corresponde a la IP y puerto del monitor de servicios (ver Anexo B para
configuración del Monitor de Servicios)


**wsAPIS/api_wr** es el punto de entrada al WebServices


**CORP_s=AMERI&ap_pass=12345678** corresponden al código de la empresa y el password de esa empresa.


Los demás datos varían según el API que se está creando.


**Respuesta del Web Service:**


El Web Services en cualquier caso, error o éxito, retorna un json así:


    - "ap_res1": “Error” o “OK” dependiendo del resultado


    - "ap_res2": Detalle del error o en caso de éxito el ID del registro en SIST_API, campo LONGINT_1.


Lleva Tu Empresa Al **149**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


Por ejemplo, en un error:


Por ejemplo, en caso de éxito:


Donde el número **502542** corresponde al ID del API (campo LONGINT_1) y permite una posterior consulta del
resultado del proceso de ese API, ver “Consulta Estado API”.


Lleva Tu Empresa Al **150**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**CONSULTA ESTADO API POR ID**


Una vez creado el API, entra en una cola de procesamiento (ver Anexo C), es decir el API no se procesa de una vez,
por ejemplo, si se va a crear un Cliente, este no se crea de inmediato, sino que hay un tiempo de espera de unos
minutos a que procese (ver Anexo C).


El estado de error o proceso se puede verificar por medio del Web Services **api_read** y con el número secuencial
del API **ap_id=NNNN** (ver punto anterior).


En cualquier caso, error o éxito, se retorna un json así:


    - "ap_res1": “Error” o “OK” dependiendo del resultado


    - "ap_res2": Detalle del error o en caso de éxito fecha y hora de procesamiento.


**Ejemplo:**


192.168.181.140:9974/ **wsAPIS/api_read** ?ap_id=502542&ap_corp=ACME&ap_pass=12345678


Lleva Tu Empresa Al **151**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**CONSULTA ESTADO API POR CODIGO DE GRUPO**


Es posible consultar los APIs por el código de operación, campos Code_s. En este caso el resultado puede contener
0, 1 o más registros, por lo que el json que se retorna es de tipo Array.


También el resultado incluye todos los campos leíbles de la tabla SIST_API, por lo que se puede usar para consultar
los APIs de lectura, por ejemplo cuando se adiciona un nuevo producto, se crea un registro con Code_s='106'.


**WebServices:** wsAPIS/api_sel


**Parámetros:**


    - ap_corp: código de la empresa


    - ap_pass: password de acceso web para la empresa


    - ap_code: código de grupo del API, por ejemplo '05' (campo Code_s)


    - ap_int1: Puede ser 0 o 1, para que retorne los registros con Integer_1= 0 o 1. Es opcional y si no se
especifica asume 1 (no procesado)


**Resultado:**


    - En caso de error: array json con los campos "ap_res1" y "ap_res2", similar a las respuestas estándar de
los APIs, pero dentro de un array.


    - En caso de no error: Array Json con la lista de registros y sus campos.


**Ejemplo:**


Consulta de los APIs de código '52':


192.168.18.14:9974/ **wsAPIS/api_sel** ?ap_corp=DGE00&ap_pass=11112222&ap_code=52


Lleva Tu Empresa Al **152**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**Resultado json:**


Lleva Tu Empresa Al **153**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


**ACTUALIZACION API POR CODIGO**


Es posible actualizar los APIs con Code_s mayor o igual a “100”. La operación de actualización cambia el campo
Integer_1 de 1 o 0 y se usa para marcar los registros de API que ya se procesaron en una aplicación externa.


**WebServices:** wsAPIS/api_act


**Parámetros:**


    - ap_corp: código de la empresa


    - ap_pass: password de acceso web para la empresa


    - ap_id: código del API, campo Longint1


**Resultado:**


    - En caso de no error: "ap_res1":"OK"


    - En caso de error: campo "ap_res1" y "ap_res2", con “Error” y la descripción respectivamente


Lleva Tu Empresa Al **154**

Siguiente Nivel **www.mba3.com** **MBA3**

**Cliente**


