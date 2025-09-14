import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Plotly from 'react-plotly.js';
import './SalesDashboard.css';

// Mapeo de meses y días a español para las gráficas
const spanishMonths = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const spanishDays = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

const SalesDashboard = () => {
    const [data, setData] = useState(null);
    const [summary, setSummary] = useState(null);
    const [duplicatedInvoices, setDuplicatedInvoices] = useState(null);
    const [file, setFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const requiredColumns = ['FECHA DE LA FACTURA', 'IMPORTE TOTAL DE LA VENTA', 'Nº DE LA FACTURA'];

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        setFile(selectedFile);
        setData(null);
        setSummary(null);
        setDuplicatedInvoices(null);
        setErrorMessage('');
        setSuccessMessage('');
    };

    const handleProcessFile = () => {
        if (!file) {
            setErrorMessage('Por favor, seleccione un archivo antes de procesar.');
            return;
        }

        setIsLoading(true);
        setErrorMessage('');
        setSuccessMessage('');

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const fileData = new Uint8Array(e.target.result);
                const workbook = XLSX.read(fileData, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (!jsonData || jsonData.length === 0) {
                    setErrorMessage('El archivo no contiene datos.');
                    setIsLoading(false);
                    return;
                }

                const headers = Object.keys(jsonData[0] || {});
                const missingColumns = requiredColumns.filter(col => !headers.includes(col));
                
                if (missingColumns.length > 0) {
                    setErrorMessage(`Faltan las siguientes columnas obligatorias: ${missingColumns.join(', ')}`);
                    setIsLoading(false);
                    return;
                }

                const processedData = jsonData.map(row => {
                    let importeString = String(row['IMPORTE TOTAL DE LA VENTA']);
                    importeString = importeString.replace(',', '.').replace(/[^\d.]/g, '');
                    const importe = parseFloat(importeString);

                    const excelDate = row['FECHA DE LA FACTURA'];
                    let parsedDate = null;
                    if (typeof excelDate === 'number') {
                        parsedDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
                    } else if (typeof excelDate === 'string') {
                        parsedDate = new Date(excelDate);
                        if (isNaN(parsedDate.getTime())) {
                            parsedDate = null;
                        }
                    }
                    
                    return {
                        ...row,
                        'FECHA': parsedDate,
                        'IMPORTE TOTAL': importe,
                    };
                });

                const invoiceCounts = processedData.reduce((acc, row) => {
                    const invoiceNumber = row['Nº DE LA FACTURA'];
                    acc[invoiceNumber] = (acc[invoiceNumber] || 0) + 1;
                    return acc;
                }, {});

                const duplicates = processedData.filter(row => invoiceCounts[row['Nº DE LA FACTURA']] > 1);
                setDuplicatedInvoices(duplicates.length > 0 ? duplicates : null);
                
                const sales = processedData.map(d => d['IMPORTE TOTAL']).filter(v => !isNaN(v));
                
                if (sales.length === 0) {
                    setErrorMessage('No hay valores numéricos válidos en la columna IMPORTE TOTAL DE LA VENTA para graficar.');
                    setIsLoading(false);
                    return;
                }

                const mean = sales.reduce((a, b) => a + b, 0) / sales.length;
                const stdDev = Math.sqrt(sales.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / sales.length);
                setSummary({
                    promedio: mean.toFixed(2),
                    maximo: Math.max(...sales).toFixed(2),
                    minimo: Math.min(...sales).toFixed(2),
                    desviacion: stdDev.toFixed(2),
                });

                setData(processedData);
                setIsLoading(false);
                setSuccessMessage('¡Archivo procesado con éxito!');
            } catch (err) {
                console.error("Error durante el procesamiento del archivo:", err);
                setErrorMessage('Error al procesar el archivo. Verifique el formato de los datos.');
                setIsLoading(false);
            }
        };

        reader.onerror = () => {
            setErrorMessage('Error al leer el archivo. Asegúrese de que no esté corrupto.');
            setIsLoading(false);
        };
        reader.readAsArrayBuffer(file);
    };

    const aggregateSalesByDate = (dataArray) => {
        const salesByDate = {};
        dataArray.forEach(item => {
            if (item['FECHA'] && typeof item['IMPORTE TOTAL'] === 'number') {
                const dateStr = item['FECHA'].toISOString().split('T')[0];
                if (salesByDate[dateStr]) {
                    salesByDate[dateStr] += item['IMPORTE TOTAL'];
                } else {
                    salesByDate[dateStr] = item['IMPORTE TOTAL'];
                }
            }
        });
        return Object.keys(salesByDate).map(date => ({
            date: date,
            sales: salesByDate[date]
        })).sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    const renderLineGraph = () => {
        if (!data || data.length === 0) return null;
        const aggregatedData = aggregateSalesByDate(data.filter(d => d['FECHA'] && d['IMPORTE TOTAL'] && !isNaN(d['IMPORTE TOTAL'])));
        
        if (aggregatedData.length === 0) {
            return <p>No hay datos de fecha o ventas válidos para mostrar en la gráfica de línea.</p>;
        }

        const dates = aggregatedData.map(d => d.date);
        const sales = aggregatedData.map(d => d.sales);

        const plotData = [{
            x: dates,
            y: sales,
            type: 'scatter',
            mode: 'lines+markers',
            marker: { color: 'var(--accent-color)' },
            line: { color: 'var(--accent-color)', width: 3 },
            name: 'Ventas Diarias',
        }];
        const layout = {
            title: 'Ventas por Día',
            xaxis: { title: 'Fecha' },
            yaxis: { title: 'Importe Total' },
            responsive: true,
            plot_bgcolor: 'var(--card-background)',
            paper_bgcolor: 'var(--card-background)',
            font: { color: 'var(--text-color)' }
        };
        return <Plotly data={plotData} layout={layout} style={{ width: '100%' }} />;
    };

    const renderRegressionGraph = () => {
        if (!data || data.length < 2) return <p>Se requieren al menos dos datos para el análisis de regresión lineal.</p>;
    
        const aggregatedData = aggregateSalesByDate(data.filter(d => d['FECHA'] && d['IMPORTE TOTAL'] && !isNaN(d['IMPORTE TOTAL'])));
        
        if (aggregatedData.length === 0) {
            return <p>No hay datos suficientes para la regresión.</p>;
        }
        
        const dates = aggregatedData.map(d => d.date);
        const sales = aggregatedData.map(d => d.sales);
    
        const x_values = dates.map(d => new Date(d).getTime());
        
        const n = x_values.length;
        if (n < 2) {
            return <p>Se requieren al menos dos puntos de datos para la regresión.</p>;
        }
        
        const sum_x = x_values.reduce((a, b) => a + b, 0);
        const sum_y = sales.reduce((a, b) => a + b, 0);
        const sum_xy = x_values.map((x, i) => x * sales[i]).reduce((a, b) => a + b, 0);
        const sum_x2 = x_values.map(x => x * x).reduce((a, b) => a + b, 0);
        
        const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
        const intercept = (sum_y - slope * sum_x) / n;
        
        const regression_line = x_values.map(x => slope * x + intercept);
    
        const plotData = [
            {
                x: dates,
                y: sales,
                mode: 'markers',
                type: 'scatter',
                name: 'Datos Reales',
                marker: { color: 'var(--accent-color)', size: 8 },
            },
            {
                x: dates,
                y: regression_line,
                mode: 'lines',
                type: 'scatter',
                name: 'Línea de Regresión',
                line: { color: 'var(--secondary-color)', width: 3 },
            }
        ];
        const layout = {
            title: 'Regresión Lineal de Ventas',
            xaxis: { title: 'Fecha' },
            yaxis: { title: 'Importe Total' },
            responsive: true,
            plot_bgcolor: 'var(--card-background)',
            paper_bgcolor: 'var(--card-background)',
            font: { color: 'var(--text-color)' }
        };
        return <Plotly data={plotData} layout={layout} style={{ width: '100%' }} />;
    };
    

    const renderBarGraph = () => {
        if (!data || data.length === 0) return null;
        const salesByMonth = {};
        data.forEach(item => {
            if (item['FECHA'] && typeof item['IMPORTE TOTAL'] === 'number') {
                const date = item['FECHA'];
                const yearMonth = `${date.getFullYear()}-${date.getMonth()}`;
                if (salesByMonth[yearMonth]) {
                    salesByMonth[yearMonth] += item['IMPORTE TOTAL'];
                } else {
                    salesByMonth[yearMonth] = item['IMPORTE TOTAL'];
                }
            }
        });

        const sortedMonths = Object.keys(salesByMonth).sort((a, b) => {
            const [yearA, monthA] = a.split('-').map(Number);
            const [yearB, monthB] = b.split('-').map(Number);
            return new Date(yearA, monthA) - new Date(yearB, monthB);
        });

        const xData = sortedMonths.map(key => {
            const [year, month] = key.split('-').map(Number);
            return `${spanishMonths[month]} ${year}`;
        });
        const yData = sortedMonths.map(key => salesByMonth[key]);

        const plotData = [{
            x: xData,
            y: yData,
            type: 'bar',
            marker: { color: 'var(--accent-color)' },
            name: 'Ventas Mensuales',
        }];
        const layout = {
            title: 'Ventas por Mes',
            xaxis: { title: 'Mes' },
            yaxis: { title: 'Importe Total' },
            responsive: true,
            plot_bgcolor: 'var(--card-background)',
            paper_bgcolor: 'var(--card-background)',
            font: { color: 'var(--text-color)' }
        };
        return <Plotly data={plotData} layout={layout} style={{ width: '100%' }} />;
    };

    const renderPieChart = () => {
        if (!data || data.length === 0) return null;
        const salesByDayOfWeek = {};
        data.forEach(item => {
            if (item['FECHA'] && typeof item['IMPORTE TOTAL'] === 'number') {
                const day = item['FECHA'].getDay();
                const dayName = spanishDays[day];
                if (salesByDayOfWeek[dayName]) {
                    salesByDayOfWeek[dayName] += item['IMPORTE TOTAL'];
                } else {
                    salesByDayOfWeek[dayName] = item['IMPORTE TOTAL'];
                }
            }
        });

        const labels = Object.keys(salesByDayOfWeek);
        const values = Object.values(salesByDayOfWeek);

        const plotData = [{
            labels: labels,
            values: values,
            type: 'pie',
            hole: 0.4,
            marker: {
                colors: [
                    'var(--accent-color)', 
                    'var(--secondary-color)', 
                    '#4A6FA5', 
                    '#166088', 
                    '#4C5B5C', 
                    '#F39C12', 
                    '#E74C3C'
                ]
            },
            hoverinfo: 'label+percent+value',
        }];

        const layout = {
            title: 'Distribución de Ventas por Día de la Semana',
            responsive: true,
            plot_bgcolor: 'var(--card-background)',
            paper_bgcolor: 'var(--card-background)',
            font: { color: 'var(--text-color)' }
        };

        return <Plotly data={plotData} layout={layout} style={{ width: '100%' }} />;
    };

    return (
        <div className="dashboard">
            <header className="header">
                <div className="header-content">
                    <h1>Dashboard de Análisis de Ventas</h1>
                    <p className="subtitle">Herramienta para la visualización y análisis de datos de ventas en archivos Excel.</p>
                    <p>Debes cargar los datos de ventas de tus datos de Registros de Compras y Ventas (RCV).</p>
                </div>
            </header>
            
            <main className="container">
                {errorMessage && <div className="alert-message">{errorMessage}</div>}
                {successMessage && <div className="success-message">{successMessage}</div>}
                
                <section className="card upload-section">
                    <div className="section-icon">📊</div>
                    <h2 className="card-title">Carga y Procesamiento de Datos</h2>
                    <p className="card-description">
                        Seleccione un archivo en formato <strong>.xls</strong> o <strong>.xlsx</strong> y luego haga clic en "Procesar Archivo".
                    </p>
                    <div className="upload-controls">
                        <label className="file-input-label">
                            <span className="file-input-button">Seleccionar archivo</span>
                            <input type="file" accept=".xls,.xlsx" onChange={handleFileChange} className="file-input" />
                            <span className="file-name">{file ? file.name : 'Ningún archivo seleccionado'}</span>
                        </label>
                        <button onClick={handleProcessFile} disabled={!file || isLoading} className="button">
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    Procesando...
                                </>
                            ) : 'Procesar Archivo'}
                        </button>
                    </div>
                </section>
                
                {isLoading && (
                    <div className="card loading-card">
                        <div className="spinner large"></div>
                        <p>Cargando datos y generando gráficos...</p>
                    </div>
                )}
                
                {!isLoading && data && (
                    <>
                        <div className="two-column-layout">
                            {data.length > 0 && (
                                <section className="card data-table-card">
                                    <div className="section-icon">📋</div>
                                    <h2 className="card-title">Vista Previa de los Datos</h2>
                                    <p className="card-description">Se muestran las primeras 10 filas de su archivo para su validación.</p>
                                    <div className="table-container">
                                        <table>
                                            <thead>
                                                <tr>{data.length > 0 && Object.keys(data[0]).map((key, i) => <th key={i}>{key}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {data.slice(0, 10).map((row, i) => (
                                                    <tr key={i}>{Object.values(row).map((val, j) => <td key={j}>{val instanceof Date ? val.toLocaleDateString() : val}</td>)}</tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            )}

                            <section className="card summary-table-card">
                                <div className="section-icon">📈</div>
                                <h2 className="card-title">Resumen Estadístico</h2>
                                <p className="card-description">Métricas clave de sus datos de ventas.</p>
                                <div className="table-container">
                                    {summary && (
                                        <table className="summary-table">
                                            <tbody>
                                                {Object.entries(summary).map(([key, value]) => (
                                                    <tr key={key}>
                                                        <th>{key.charAt(0).toUpperCase() + key.slice(1)}</th>
                                                        <td>{value} Bs</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                                
                                <h2 className="card-title mt-30">Facturas Duplicadas</h2>
                                {duplicatedInvoices && duplicatedInvoices.length > 0 ? (
                                    <div className="table-container">
                                        <p className="card-description-small">Se detectaron <strong>{duplicatedInvoices.length}</strong> facturas duplicadas. Se muestran a continuación.</p>
                                        <table>
                                            <thead>
                                                <tr>{duplicatedInvoices.length > 0 && Object.keys(duplicatedInvoices[0]).map((key, i) => <th key={i}>{key}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {duplicatedInvoices.map((row, i) => (
                                                    <tr key={i}>{Object.values(row).map((val, j) => <td key={j}>{val instanceof Date ? val.toLocaleDateString() : val}</td>)}</tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="no-duplicates">No se detectaron facturas duplicadas.</p>
                                )}
                            </section>
                        </div>
                        
                        <section className="card graph-card">
                            <div className="section-icon">📉</div>
                            <h2 className="card-title">Análisis Gráfico de Ventas</h2>
                            <p className="card-description">Explore las tendencias de ventas con estas visualizaciones interactivas.</p>
                            
                            <div className="graph-container">
                                <h3 className="graph-title">Ventas por Día</h3>
                                <p className="graph-description">Muestra el comportamiento de las ventas totales día a día, ideal para identificar picos o caídas en la actividad comercial.</p>
                                <div className="graph">{renderLineGraph()}</div>
                            </div>
                            
                            <div className="graph-container">
                                <h3 className="graph-title">Ventas por Mes</h3>
                                <p className="graph-description">Agrega las ventas totales de cada mes para visualizar la estacionalidad y las tendencias a largo plazo.</p>
                                <div className="graph">{renderBarGraph()}</div>
                            </div>
                            
                            <div className="graph-container">
                                <h3 className="graph-title">Distribución de Ventas por Día de la Semana</h3>
                                <p className="graph-description">Identifique los días de la semana con mayor o menor actividad de ventas para optimizar recursos y campañas.</p>
                                <div className="graph">{renderPieChart()}</div>
                            </div>
                            
                            <div className="graph-container">
                                <h3 className="graph-title">Regresión Lineal de Ventas</h3>
                                <p className="graph-description">Visualiza la tendencia general de las ventas. La línea de regresión muestra la dirección del crecimiento o decrecimiento a lo largo del tiempo.</p>
                                <div className="graph">{renderRegressionGraph()}</div>
                            </div>
                        </section>
                    </>
                )}
            </main>
            
            <footer className="footer">
                <div className="footer-content">
                    <div className="footer-section">
                        <h3>Dashboard de Análisis de Ventas</h3>
                        <p>Desarrollado por Carlos Dev</p>
                        <p>&copy; 2025 - Todos los derechos reservados</p>
                    </div>
                    
                    <div className="footer-section">
                        <h3>Referencias Bibliográficas</h3>
                        <ul className="references-list">
                            <li>
                                <a href="https://eloquentjavascript.net/" target="_blank" rel="noopener noreferrer">
                                    <strong>JavaScript Eloquente</strong> por Marijn Haverbeke
                                </a>
                            </li>
                            <li>
                                <a href="https://carlosazaustre.es/" target="_blank" rel="noopener noreferrer">
                                    <strong>Aprender React</strong> por Carlos Azaustre
                                </a>
                            </li>
                            <li>
                                <a href="https://kalob.io/" target="_blank" rel="noopener noreferrer">
                                    <strong>JavaScript Professional</strong> por Kalob Taulien
                                </a>
                            </li>
                            <li>
                                <a href="https://www.oreilly.com/library/view/react-up/9781492067885/" target="_blank" rel="noopener noreferrer">
                                    <strong>React: Up & Running, 2ª Edición</strong> por Stoyan Stefanov
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default SalesDashboard;