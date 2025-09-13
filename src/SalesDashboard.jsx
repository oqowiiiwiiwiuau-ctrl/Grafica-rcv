import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Plotly from 'react-plotly.js';
import './SalesDashboard.css';

const SalesDashboard = () => {
    const [data, setData] = useState(null);
    const [summary, setSummary] = useState(null);
    const [duplicatedData, setDuplicatedData] = useState(null);
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
        setDuplicatedData(null);
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

                const duplicates = processedData.filter((row, index, self) =>
                    self.findIndex(t => t['Nº DE LA FACTURA'] === row['Nº DE LA FACTURA']) !== index
                );
                setDuplicatedData(duplicates.length > 0 ? duplicates : null);

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
            marker: { color: 'rgb(75, 192, 192)' },
        }];
        const layout = {
            title: 'Ventas por Día (Gráfica de Línea)',
            xaxis: { title: 'Fecha' },
            yaxis: { title: 'Importe Total' },
            responsive: true,
        };
        return <Plotly data={plotData} layout={layout} style={{ width: '100%' }} />;
    };

    const renderRegressionGraph = () => {
        if (!data || data.length === 0) return null;
        const aggregatedData = aggregateSalesByDate(data.filter(d => d['FECHA'] && d['IMPORTE TOTAL'] && !isNaN(d['IMPORTE TOTAL'])));
        
        if (aggregatedData.length === 0) {
            return <p>No hay datos de fecha o ventas válidos para mostrar en la gráfica de regresión.</p>;
        }
        
        const dates = aggregatedData.map(d => d.date);
        const sales = aggregatedData.map(d => d.sales);

        const x_values = dates.map(d => new Date(d).getTime());
        
        const n = x_values.length;
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
                marker: { color: 'rgba(75, 192, 192, 0.6)' },
            },
            {
                x: dates,
                y: regression_line,
                mode: 'lines',
                type: 'scatter',
                name: 'Línea de Regresión',
                marker: { color: 'red' },
            }
        ];
        const layout = {
            title: 'Regresión Lineal de Ventas',
            xaxis: { title: 'Fecha' },
            yaxis: { title: 'Importe Total' },
            responsive: true,
        };
        return <Plotly data={plotData} layout={layout} style={{ width: '100%' }} />;
    };

    const renderMultipleRegressionGraph = () => {
        if (!data || data.length < 2) return <p>Se requieren al menos dos datos para el análisis de regresión múltiple.</p>;

        const aggregatedData = aggregateSalesByDate(data.filter(d => d['FECHA'] && d['IMPORTE TOTAL'] && !isNaN(d['IMPORTE TOTAL'])));
        
        if (aggregatedData.length === 0) {
            return <p>No hay datos suficientes para la regresión múltiple.</p>;
        }
        
        const dates = aggregatedData.map(d => d.date);
        const sales = aggregatedData.map(d => d.sales);
        
        const x_values = dates.map(d => new Date(d).getTime());

        const n = x_values.length;
        if (n < 2) {
            return <p>Se requieren al menos dos puntos de datos para la regresión.</p>;
        }
        
        const x_mean = x_values.reduce((a, b) => a + b, 0) / n;
        const y_mean = sales.reduce((a, b) => a + b, 0) / n;

        const ss_xx = x_values.map(x => Math.pow(x - x_mean, 2)).reduce((a, b) => a + b);
        const ss_xy = x_values.map((x, i) => (x - x_mean) * (sales[i] - y_mean)).reduce((a, b) => a + b);

        const beta1 = ss_xy / ss_xx;
        const beta0 = y_mean - beta1 * x_mean;

        const predicted_y = x_values.map(x => beta0 + beta1 * x);

        const plotData = [
            {
                x: dates,
                y: sales,
                mode: 'markers',
                type: 'scatter',
                name: 'Ventas Reales',
                marker: { color: 'rgba(75, 192, 192, 0.6)' },
            },
            {
                x: dates,
                y: predicted_y,
                mode: 'lines',
                type: 'scatter',
                name: 'Predicción del Modelo',
                marker: { color: 'orange' },
            }
        ];
        const layout = {
            title: 'Predicción de Ventas con Regresión Múltiple',
            xaxis: { title: 'Fecha' },
            yaxis: { title: 'Importe Total' },
            responsive: true,
        };
        return <Plotly data={plotData} layout={layout} style={{ width: '100%' }} />;
    };

    return (
        <div className="dashboard">
            <header className="header">
                <h1>Dashboard de Análisis de Ventas</h1>
                <p className="subtitle">Herramienta para la visualización y análisis de datos de ventas en archivos Excel.</p>
            </header>
            <main className="container">
                {errorMessage && <div className="alert-message">{errorMessage}</div>}
                {successMessage && <div className="success-message">{successMessage}</div>}
                
                <section className="card upload-section">
                    <h2 className="card-title">Carga y Procesamiento de Datos</h2>
                    <p className="card-description">
                        Seleccione un archivo en formato **.xls** o **.xlsx** y luego haga clic en "Procesar Archivo".
                    </p>
                    <input type="file" accept=".xls,.xlsx" onChange={handleFileChange} className="file-input" />
                    <button onClick={handleProcessFile} disabled={!file || isLoading} className="button">
                        {isLoading ? 'Procesando...' : 'Procesar Archivo'}
                    </button>
                </section>
                
                {isLoading && (
                    <div className="card loading-card">
                        <p>Cargando datos y generando gráficos...</p>
                    </div>
                )}
                
                {!isLoading && data && (
                    <>
                        <div className="two-column-layout">
                            {data.length > 0 && (
                                <section className="card data-table-card">
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
                                <h2 className="card-title">Resumen Estadístico</h2>
                                <p className="card-description">Métricas clave de sus datos de ventas.</p>
                                <div className="table-container">
                                    {summary && (
                                        <table>
                                            <tbody>
                                                {Object.entries(summary).map(([key, value]) => (
                                                    <tr key={key}>
                                                        <th>{key.charAt(0).toUpperCase() + key.slice(1)}</th>
                                                        <td>{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                                <h2 className="card-title">Facturas Duplicadas</h2>
                                {duplicatedData && duplicatedData.length > 0 ? (
                                    <div className="table-container">
                                        <table>
                                            <thead>
                                                <tr>{duplicatedData.length > 0 && Object.keys(duplicatedData[0]).map((key, i) => <th key={i}>{key}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {duplicatedData.map((row, i) => (
                                                    <tr key={i}>{Object.values(row).map((val, j) => <td key={j}>{val instanceof Date ? val.toLocaleDateString() : val}</td>)}</tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p>No se detectaron facturas duplicadas.</p>
                                )}
                            </section>
                        </div>
                        <section className="card graph-card">
                            <h2 className="card-title">Análisis de Ventas a lo largo del Tiempo</h2>
                            <p className="card-description">Explore las tendencias de ventas con estas visualizaciones interactivas.</p>
                            <div className="graph-container">
                                <h3 className="graph-title">Ventas por Día (Gráfica de Línea)</h3>
                                <p className="graph-description">Muestra el comportamiento de las ventas totales día a día, ideal para identificar picos o caídas en la actividad comercial.</p>
                                <div className="graph">{renderLineGraph()}</div>
                            </div>
                            <div className="graph-container">
                                <h3 className="graph-title">Regresión Lineal de Ventas</h3>
                                <p className="graph-description">Visualiza la tendencia general de las ventas. La línea de regresión muestra la dirección del crecimiento o decrecimiento a lo largo del tiempo.</p>
                                <div className="graph">{renderRegressionGraph()}</div>
                            </div>
                            <div className="graph-container">
                                <h3 className="graph-title">Predicción con Regresión Múltiple</h3>
                                <p className="graph-description">Compara las ventas reales con una predicción de modelo, ayudando a evaluar la precisión de los pronósticos y detectar desviaciones significativas.</p>
                                <div className="graph">{renderMultipleRegressionGraph()}</div>
                            </div>
                        </section>
                    </>
                )}
            </main>
            <footer className="footer">
                <p>&copy; 2025 - Dashboard de Análisis de Ventas Desarrollado con React.</p>
            </footer>
        </div>
    );
};

export default SalesDashboard;